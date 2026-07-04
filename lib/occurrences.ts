import "server-only";

import { and, eq, gte, notInArray } from "drizzle-orm";

import { db } from "@/db";
import { attendance, serviceSchedules, services } from "@/db/schema";
import type { ServiceSchedule } from "@/db/schema";
import { OCCURRENCE_WEEKS_AHEAD } from "@/lib/constants";

/** Upcoming dates (at midnight) matching `dayOfWeek` for the next `weeks`. */
function upcomingDates(dayOfWeek: number, weeks: number, from = new Date()) {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const delta = (dayOfWeek - start.getDay() + 7) % 7;
  const first = new Date(start);
  first.setDate(start.getDate() + delta);

  const dates: Date[] = [];
  for (let i = 0; i < weeks; i++) {
    const d = new Date(first);
    d.setDate(first.getDate() + i * 7);
    dates.push(d);
  }
  return dates;
}

function withTime(date: Date, timeOfDay: string) {
  const [h, m] = timeOfDay.split(":").map((n) => Number(n));
  const d = new Date(date);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Generate the next `weeks` of occurrences for a schedule. Idempotent — the
 * unique (scheduleId, scheduledAt) index means re-running only fills gaps.
 * Returns how many new occurrences were created.
 */
export async function generateForSchedule(
  schedule: Pick<
    ServiceSchedule,
    "id" | "name" | "type" | "dayOfWeek" | "timeOfDay" | "location"
  >,
  weeks = OCCURRENCE_WEEKS_AHEAD,
): Promise<number> {
  const values = upcomingDates(schedule.dayOfWeek, weeks).map((date) => ({
    name: schedule.name,
    type: schedule.type,
    location: schedule.location ?? null,
    scheduledAt: withTime(date, schedule.timeOfDay),
    scheduleId: schedule.id,
  }));

  if (values.length === 0) return 0;

  const inserted = await db
    .insert(services)
    .values(values)
    .onConflictDoNothing()
    .returning({ id: services.id });

  return inserted.length;
}

/**
 * Remove future occurrences of a schedule that have no attendance yet — used
 * before regenerating when a schedule's day/time changes. Past services and
 * anything already scanned into are preserved.
 */
export async function deleteFutureEmptyOccurrences(scheduleId: string) {
  const attendedServiceIds = db
    .select({ id: attendance.serviceId })
    .from(attendance);

  await db
    .delete(services)
    .where(
      and(
        eq(services.scheduleId, scheduleId),
        gte(services.scheduledAt, startOfToday()),
        notInArray(services.id, attendedServiceIds),
      ),
    );
}

/** Fill in upcoming occurrences for every active schedule. Safe to call often. */
export async function topUpAllSchedules(weeks = OCCURRENCE_WEEKS_AHEAD) {
  const active = await db
    .select()
    .from(serviceSchedules)
    .where(eq(serviceSchedules.active, true));

  let created = 0;
  for (const schedule of active) {
    created += await generateForSchedule(schedule, weeks);
  }
  return created;
}
