/**
 * Birthdays, spiritual birthdays and wedding anniversaries falling inside a
 * window of days.
 *
 * This module holds the celebration rules — which dates count, for whom, and
 * how a range becomes a window. The calendar arithmetic under them, on
 * `"YYYY-MM-DD"` strings, is `lib/dates.ts`.
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
import {
  addDays,
  anniversaryIn,
  dateParts,
  datesBetween,
  daysInMonth,
  isLeapYear,
  isoDate,
} from "@/lib/dates";

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

/**
 * The days a range covers. The week runs forward from today, so it never
 * lists a birthday that has already been missed; the month is the whole
 * calendar month, so a greeting that is late is still visible.
 */
export function celebrationWindow(
  range: CelebrationRange,
  today: string,
): CelebrationWindow {
  const { year, month } = dateParts(today);
  if (range === "month") {
    return {
      start: isoDate(year, month, 1),
      end: isoDate(year, month, daysInMonth(year, month)),
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
  return datesBetween(window.start, window.end).flatMap((date) => {
    const { year, month, day } = dateParts(date);
    const key = month * 100 + day;
    return key === 228 && !isLeapYear(year) ? [key, 229] : [key];
  });
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
  const startYear = dateParts(window.start).year;
  const endYear = dateParts(window.end).year;
  for (let year = startYear; year <= endYear; year++) {
    const observed = anniversaryIn(date, year);
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
      const years = dateParts(observedOn).year - dateParts(date).year;
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
