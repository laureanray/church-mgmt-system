import "server-only";

import { and, eq, gte, notInArray } from "drizzle-orm";

import { db } from "@/db";
import {
  attendance,
  lineupAssignments,
  lineupSongs,
  serviceSchedules,
  services,
} from "@/db/schema";
import type { ServiceSchedule } from "@/db/schema";
import { zonedInstant } from "@/lib/church-time";
import { addDays, todayIn, weekdayOf } from "@/lib/dates";

/*
 * A schedule's day and time are the church's wall clock — "Sunday 09:00" means
 * 9 AM in Manila — so "today", the weekday and the time are all worked out in
 * the church's zone (lib/church-time.ts), never the server's. On Vercel the
 * server is on UTC, where "today" starts at 8 AM Manila time and 09:00 is 5 PM.
 */

/**
 * The church-calendar dates a schedule should have an occurrence on: the next
 * one after today, plus today's when today is the meeting day. Today's is kept
 * however late it is — /scan needs it all day — and the one after it means a
 * schedule never reads as having nothing upcoming once its service has begun.
 */
function upcomingDates(dayOfWeek: number, from = new Date()) {
  const today = todayIn(undefined, from);
  const delta = (dayOfWeek - weekdayOf(today) + 7) % 7;
  const next = addDays(today, delta || 7);

  return delta === 0 ? [today, next] : [next];
}

/** Midnight at the start of the church's today, as an instant. */
function startOfToday(now = new Date()) {
  return zonedInstant(todayIn(undefined, now), "00:00");
}

type SchedulePlan = Pick<
  ServiceSchedule,
  "id" | "name" | "type" | "dayOfWeek" | "timeOfDay" | "location"
>;

/**
 * The rows a schedule's upcoming occurrences would produce. Pure — no database
 * — so callers can batch several schedules into one insert.
 */
export function occurrenceValues(schedule: SchedulePlan, from = new Date()) {
  return upcomingDates(schedule.dayOfWeek, from).map((date) => ({
    name: schedule.name,
    type: schedule.type,
    location: schedule.location ?? null,
    scheduledAt: zonedInstant(date, schedule.timeOfDay),
    scheduleId: schedule.id,
  }));
}

/**
 * Generate a schedule's upcoming occurrences. Idempotent — the unique
 * (scheduleId, scheduledAt) index means re-running only fills gaps. Returns
 * how many new occurrences were created.
 */
export async function generateForSchedule(
  schedule: SchedulePlan,
): Promise<number> {
  const values = occurrenceValues(schedule);

  if (values.length === 0) return 0;

  const inserted = await db
    .insert(services)
    .values(values)
    .onConflictDoNothing()
    .returning({ id: services.id });

  return inserted.length;
}

/**
 * Remove future occurrences of a schedule that nobody has used yet — used
 * before regenerating when a schedule's day/time changes. Past services, and
 * anything already scanned into or given a LAM line-up (songs or team), are
 * preserved: deleting a service cascades to its line-up, so a rebuild would
 * otherwise discard a plan without a word.
 */
export async function deleteFutureEmptyOccurrences(scheduleId: string) {
  const attendedServiceIds = db
    .select({ id: attendance.serviceId })
    .from(attendance);
  const servicesWithSongs = db
    .select({ id: lineupSongs.serviceId })
    .from(lineupSongs);
  const servicesWithTeam = db
    .select({ id: lineupAssignments.serviceId })
    .from(lineupAssignments);

  await db
    .delete(services)
    .where(
      and(
        eq(services.scheduleId, scheduleId),
        gte(services.scheduledAt, startOfToday()),
        notInArray(services.id, attendedServiceIds),
        notInArray(services.id, servicesWithSongs),
        notInArray(services.id, servicesWithTeam),
      ),
    );
}

/**
 * Fill in upcoming occurrences for every active schedule. Safe to call often —
 * and it is called often, on every /services and /scan page load, since there
 * is no cron.
 *
 * That makes its cost part of those pages' time to first byte, so all the
 * schedules go in as one insert rather than one per schedule. Two round trips,
 * whatever the number of schedules.
 */
export async function topUpAllSchedules() {
  const active = await db
    .select()
    .from(serviceSchedules)
    .where(eq(serviceSchedules.active, true));

  const values = active.flatMap((schedule) => occurrenceValues(schedule));

  if (values.length === 0) return 0;

  const inserted = await db
    .insert(services)
    .values(values)
    .onConflictDoNothing()
    .returning({ id: services.id });

  return inserted.length;
}
