/**
 * Birthdays, spiritual birthdays and wedding anniversaries falling inside a
 * window of days.
 *
 * Everything here works on the `"YYYY-MM-DD"` strings Postgres `date` columns
 * come back as, never on `Date`: a celebration is a month and a day, and
 * turning one into an instant invites the server's timezone to move it. The
 * one place a clock is read is `todayIn`, which asks for the calendar date in
 * the church's own timezone rather than the server's (Vercel runs in UTC, eight
 * hours behind Manila).
 *
 * Pure — no React, no Drizzle — so it is tested in `lib/celebrations.test.ts`.
 * The query that feeds it is `lib/celebrations-query.ts`.
 */

import {
  PASTORAL_STATUSES,
  SPOUSE_RELEVANT_STATUSES,
  type MaritalStatus,
  type MemberStatus,
} from "@/lib/constants";

/** The church keeps Philippine time; "today" means today in Manila. */
export const CHURCH_TIME_ZONE = "Asia/Manila";

export const CELEBRATION_RANGES = ["week", "month"] as const;
export type CelebrationRange = (typeof CELEBRATION_RANGES)[number];

export const CELEBRATION_RANGE_LABELS: Record<CelebrationRange, string> = {
  week: "Next 7 days",
  month: "This month",
};

export const CELEBRATION_KINDS = [
  "birthday",
  "spiritual_birthday",
  "wedding_anniversary",
] as const;
export type CelebrationKind = (typeof CELEBRATION_KINDS)[number];

export const CELEBRATION_KIND_LABELS: Record<CelebrationKind, string> = {
  birthday: "Birthday",
  spiritual_birthday: "Spiritual birthday",
  wedding_anniversary: "Wedding anniversary",
};

/** An inclusive span of calendar days, both ends `"YYYY-MM-DD"`. */
export type CelebrationWindow = { start: string; end: string };

/** The member fields a celebration is read from. */
export type CelebrationSource = {
  id: string;
  fullName: string;
  status: MemberStatus;
  maritalStatus: MaritalStatus | null;
  birthdate: string | null;
  spiritualBirthday: string | null;
  weddingAnniversary: string | null;
  cellGroup: { id: string; name: string } | null;
};

export type Celebration = {
  /** Unique per row: one member can have two celebrations in one window. */
  key: string;
  memberId: string;
  fullName: string;
  kind: CelebrationKind;
  /** The stored date, year included. */
  date: string;
  /** The day it is celebrated inside the window. */
  observedOn: string;
  /** Age turned, or years married / since salvation; `null` if not positive. */
  years: number | null;
  cellGroup: { id: string; name: string } | null;
};

/** `?range=` from the URL, falling back to the week for anything else. */
export function parseCelebrationRange(value: unknown): CelebrationRange {
  const first = Array.isArray(value) ? value[0] : value;
  return CELEBRATION_RANGES.find((range) => range === first) ?? "week";
}

/** Today's calendar date in `timeZone`, as `"YYYY-MM-DD"`. */
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

/**
 * The days a range covers. The week runs forward from today, so it never
 * lists a birthday that has already been missed; the month is the whole
 * calendar month, so a greeting that is late is still visible.
 */
export function celebrationWindow(
  range: CelebrationRange,
  today: string,
): CelebrationWindow {
  const { year, month } = parts(today);
  if (range === "month") {
    return {
      start: iso(year, month, 1),
      end: iso(year, month, daysInMonth(year, month)),
    };
  }
  return { start: today, end: addDays(today, 6) };
}

/**
 * Every month-day in the window as `month * 100 + day` — 2 January is `102` —
 * for the query to match against with `EXTRACT`. A window holding 28 February
 * of a non-leap year also holds `229`, since that is when a 29 February date
 * is celebrated.
 */
export function monthDayKeys(window: CelebrationWindow): number[] {
  const keys: number[] = [];
  for (let day = window.start; day <= window.end; day = addDays(day, 1)) {
    const { year, month, date } = parts(day);
    keys.push(month * 100 + date);
    if (month === 2 && date === 28 && !isLeapYear(year)) keys.push(229);
  }
  return keys;
}

/**
 * The day inside the window on which `date` recurs, or `null` if it does not.
 * Only the month and day are compared; a window crossing New Year is tried
 * against both of its years.
 */
export function observedIn(
  date: string,
  window: CelebrationWindow,
): string | null {
  const { month, date: day } = parts(date);
  const startYear = parts(window.start).year;
  const endYear = parts(window.end).year;
  for (let year = startYear; year <= endYear; year++) {
    // 29 February is kept on the 28th in a year without one.
    const observed = iso(
      year,
      month,
      month === 2 && day === 29 && !isLeapYear(year) ? 28 : day,
    );
    if (observed >= window.start && observed <= window.end) return observed;
  }
  return null;
}

/**
 * The celebrations in `window`, soonest first.
 *
 * Members who have transferred or died are left out, and so is a wedding
 * anniversary for anyone whose marital status says there is no marriage to
 * mark — the column can outlive the status that made it relevant.
 */
export function collectCelebrations(
  sources: readonly CelebrationSource[],
  window: CelebrationWindow,
): Celebration[] {
  const found: Celebration[] = [];
  for (const member of sources) {
    if (!PASTORAL_STATUSES.includes(member.status)) continue;
    const dates: [CelebrationKind, string | null][] = [
      ["birthday", member.birthdate],
      ["spiritual_birthday", member.spiritualBirthday],
      [
        "wedding_anniversary",
        member.maritalStatus &&
        SPOUSE_RELEVANT_STATUSES.includes(member.maritalStatus)
          ? member.weddingAnniversary
          : null,
      ],
    ];
    for (const [kind, date] of dates) {
      if (!date) continue;
      const observedOn = observedIn(date, window);
      if (!observedOn) continue;
      const years = parts(observedOn).year - parts(date).year;
      found.push({
        key: `${member.id}:${kind}`,
        memberId: member.id,
        fullName: member.fullName,
        kind,
        date,
        observedOn,
        years: years > 0 ? years : null,
        cellGroup: member.cellGroup,
      });
    }
  }
  return found.sort(
    (a, b) =>
      a.observedOn.localeCompare(b.observedOn) ||
      a.fullName.localeCompare(b.fullName) ||
      CELEBRATION_KINDS.indexOf(a.kind) - CELEBRATION_KINDS.indexOf(b.kind),
  );
}

/** "Turns 34" for a birthday, "12 years" for the others. */
export function celebrationYearsLabel(
  kind: CelebrationKind,
  years: number | null,
): string | null {
  if (years == null) return null;
  if (kind === "birthday") return `Turns ${years}`;
  return years === 1 ? "1 year" : `${years} years`;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function parts(value: string) {
  const [year, month, date] = value.split("-").map(Number);
  return { year, month, date };
}

function iso(year: number, month: number, date: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(date)}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDays(value: string, days: number): string {
  const { year, month, date } = parts(value);
  const next = new Date(Date.UTC(year, month - 1, date + days));
  return iso(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}
