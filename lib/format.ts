// Display formatting helpers. Dates from Postgres `date` columns arrive as
// "YYYY-MM-DD" strings; timestamps arrive as Date objects.

import { DAYS_OF_WEEK } from "@/lib/constants";

const DATE_FMT = new Intl.DateTimeFormat("en-PH", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

const DATETIME_FMT = new Intl.DateTimeFormat("en-PH", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const TIME_FMT = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
});

/** Format a "YYYY-MM-DD" date string for display. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  // Parse as local noon to avoid timezone rollover on date-only values.
  const d = new Date(`${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return DATE_FMT.format(d);
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

/** Value for an <input type="datetime-local"> from a Date. */
export function toDateTimeLocal(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** Format a 24h "HH:mm" string as a friendly time, e.g. "9:00 AM". */
export function formatTimeOfDay(hhmm: string): string {
  const [h, m] = hhmm.split(":").map((n) => Number(n));
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return TIME_FMT.format(d);
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
