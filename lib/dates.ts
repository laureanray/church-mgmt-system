/**
 * Calendar arithmetic on the `"YYYY-MM-DD"` strings Postgres `date` columns
 * come back as.
 *
 * A date-only value is a calendar day, not an instant, so nothing here turns
 * one into a local `Date`: that would hand the server's timezone a chance to
 * move it. Where a `Date` is used internally it is pinned to UTC and only ever
 * read back with the `getUTC*` methods. The one place a clock is read is
 * `todayIn`, which asks for the calendar date in a named timezone.
 *
 * Parsing and validating what someone typed into a date field is a separate
 * concern and lives in `lib/date-input.ts`.
 */

import { CHURCH_TIME_ZONE } from "@/lib/constants";

export type DateParts = { year: number; month: number; day: number };

/** Split `"YYYY-MM-DD"` into numbers; `month` is 1-based. */
export function dateParts(value: string): DateParts {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

/** Build `"YYYY-MM-DD"` from numbers; `month` is 1-based. */
export function isoDate(year: number, month: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
}

/** Today's calendar date in `timeZone` — the church's, unless told otherwise. */
export function todayIn(
  timeZone: string = CHURCH_TIME_ZONE,
  now: Date = new Date(),
): string {
  // en-CA is the locale whose short date is already ISO-ordered.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** `month` is 1-based. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The date `days` later (or earlier, if negative), across months and years. */
export function addDays(value: string, days: number): string {
  const { year, month, day } = dateParts(value);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return isoDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

/** Every date from `start` to `end`, both included. */
export function datesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) dates.push(day);
  return dates;
}

/**
 * The day `date` recurs on in `year`: the same month and day, except that
 * 29 February falls on the 28th in a year without one.
 */
export function anniversaryIn(date: string, year: number): string {
  const { month, day } = dateParts(date);
  const leapDay = month === 2 && day === 29 && !isLeapYear(year);
  return isoDate(year, month, leapDay ? 28 : day);
}

/** The weekday a date falls on: 0 = Sunday … 6 = Saturday, like `Date.getDay()`. */
export function weekdayOf(value: string): number {
  const { year, month, day } = dateParts(value);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}
