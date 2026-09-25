// Display formatting helpers. Dates from Postgres `date` columns arrive as
// "YYYY-MM-DD" strings; timestamps arrive as Date objects.
//
// A timestamp is an instant, so it is shown in the church's timezone by name.
// Left to the process's zone, the server (UTC on Vercel) and the browser
// (Manila) render the same check-in eight hours apart — and React, finding the
// server's HTML disagree with its own, throws the server render away.

import { toChurchDateTimeLocal } from "@/lib/church-time";
import { CHURCH_TIME_ZONE, DAYS_OF_WEEK } from "@/lib/constants";

// A "YYYY-MM-DD" value is a calendar date, not an instant: it is read as UTC
// midnight and formatted in UTC, so no timezone can move it to another day.
// (Parsing at the process's local noon and formatting with a zone fixed when
// this module loaded disagreed as soon as the zone changed in between.)
const DATE_FMT = new Intl.DateTimeFormat("en-PH", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "numeric",
});

const DATETIME_FMT = new Intl.DateTimeFormat("en-PH", {
  timeZone: CHURCH_TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const TIME_FMT = new Intl.DateTimeFormat("en-PH", {
  timeZone: CHURCH_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

// For a bare "HH:mm" that is no instant at all: pinned to UTC on both sides,
// so the digits come back exactly as given.
const TIME_OF_DAY_FMT = new Intl.DateTimeFormat("en-PH", {
  timeZone: "UTC",
  hour: "numeric",
  minute: "2-digit",
});

/** Format a "YYYY-MM-DD" date string for display. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return value;
  return DATE_FMT.format(d);
}

const MONTH_DAY_FMT = new Intl.DateTimeFormat("en-PH", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
});

/** "Sat, Jan 2" from a "YYYY-MM-DD" string — a date whose year goes without saying. */
export function formatMonthDay(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return value;
  return MONTH_DAY_FMT.format(d);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return DATETIME_FMT.format(d);
}

export function formatTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return TIME_FMT.format(d);
}

/**
 * Value for an <input type="datetime-local"> from a Date, in church time — the
 * same wall clock the service action reads the input back as, so saving a form
 * without touching the time leaves the service where it was.
 */
export function toDateTimeLocal(value: Date | string): string {
  return toChurchDateTimeLocal(typeof value === "string" ? new Date(value) : value);
}

/** Format a 24h "HH:mm" string as a friendly time, e.g. "9:00 AM". */
export function formatTimeOfDay(hhmm: string): string {
  const [h, m] = hhmm.split(":").map((n) => Number(n));
  return TIME_OF_DAY_FMT.format(new Date(Date.UTC(2000, 0, 1, h || 0, m || 0)));
}

/** "Wed · 9:00 AM · Room 2" from parts; omits missing pieces; "—" if empty. */
export function formatMeeting(
  day: number | null,
  time: string | null,
  location: string | null,
): string {
  const parts: string[] = [];
  if (day != null && day >= 0 && day <= 6) parts.push(DAYS_OF_WEEK[day].slice(0, 3));
  if (time) parts.push(formatTimeOfDay(time)); // reuse the existing helper — do NOT re-derive AM/PM
  if (location) parts.push(location);
  return parts.length ? parts.join(" · ") : "—";
}

export function initials(name: string): string {
  return (
    name
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}
