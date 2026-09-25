/**
 * Instants, read and written as the church's wall clock.
 *
 * A service is held at a wall-clock time in Manila — "Sunday, 9:00 AM" — but
 * stored as an instant. `setHours`, `getHours` and an `Intl` formatter with no
 * `timeZone` all use whatever zone the process happens to run in, and that
 * differs by machine: every browser here is on Manila time, while the server
 * on Vercel is on UTC. The same code therefore stored 9:00 AM Manila on a
 * laptop and 5:00 PM Manila in production, and showed one instant as two
 * different times on the server and in the browser.
 *
 * Everything here names the zone instead, so it gives the same answer on any
 * machine. Date-only values (birthdays and the like) are calendar days, not
 * instants; they live in `lib/dates.ts`.
 */

import { CHURCH_TIME_ZONE } from "@/lib/constants";
import { dateParts, weekdayOf } from "@/lib/dates";

export type WallClock = {
  /** `"YYYY-MM-DD"` */
  date: string;
  /** `"HH:mm"`, 24-hour */
  time: string;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function fields(instant: Date, timeZone: string) {
  const out: Record<string, number> = {};
  for (const part of partsFormatter(timeZone).formatToParts(instant)) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return out as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;
}

/** How far `timeZone`'s wall clock is ahead of UTC at `epochMs`, in ms. */
function offsetAt(epochMs: number, timeZone: string) {
  const f = fields(new Date(epochMs), timeZone);
  const wall = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second);
  return wall - Math.floor(epochMs / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The date, time and weekday the wall clock in `timeZone` shows at `instant`. */
export function wallClock(
  instant: Date,
  timeZone: string = CHURCH_TIME_ZONE,
): WallClock {
  const f = fields(instant, timeZone);
  const date = `${String(f.year).padStart(4, "0")}-${pad(f.month)}-${pad(f.day)}`;
  return { date, time: `${pad(f.hour)}:${pad(f.minute)}`, weekday: weekdayOf(date) };
}

/**
 * The instant at which the wall clock in `timeZone` reads `date` at `time`
 * (`"HH:mm"`). The second pass settles a date whose offset differs from the
 * first guess's, as across a daylight-saving change; Manila has none, but the
 * zone is a parameter.
 */
export function zonedInstant(
  date: string,
  time: string,
  timeZone: string = CHURCH_TIME_ZONE,
): Date {
  const { year, month, day } = dateParts(date);
  const [hour, minute] = time.split(":").map(Number);
  const wall = Date.UTC(year, month - 1, day, hour || 0, minute || 0);
  const first = wall - offsetAt(wall, timeZone);
  return new Date(wall - offsetAt(first, timeZone));
}

const DATETIME_LOCAL = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/;

/**
 * An `<input type="datetime-local">` value, read as church time. The input
 * carries no zone, so `new Date(value)` would read it in the server's.
 *
 * A value the calendar does not have — 30 February, month 13, 25:00 — is
 * refused rather than rolled into another day: the date picker never sends
 * one, but the HTTP API accepts whatever a client posts.
 */
export function parseChurchDateTime(value: string): Date | null {
  const match = DATETIME_LOCAL.exec(value);
  if (!match) return null;
  const [, date, time] = match;
  // Four and two digits apiece, so the instant is always a real number; the
  // read-back is what catches values out of range.
  const instant = zonedInstant(date, time);
  const readBack = wallClock(instant);
  return readBack.date === date && readBack.time === time ? instant : null;
}

/** The `<input type="datetime-local">` value that shows `instant` in church time. */
export function toChurchDateTimeLocal(instant: Date): string {
  const { date, time } = wallClock(instant);
  return `${date}T${time}`;
}
