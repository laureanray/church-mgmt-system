import { expect, it } from "bun:test";

import { inEachProcessTimeZone } from "../tests/support/time-zones";
import { occurrenceValues } from "./occurrences";

const sundayNine = {
  id: "sched-1",
  name: "Sunday Service",
  type: "sunday_service" as const,
  dayOfWeek: 0,
  timeOfDay: "09:00",
  location: null,
};

/** An instant written as Manila wall-clock time, so the tests read naturally. */
const manila = (dateTime: string) => new Date(`${dateTime}+08:00`);

// Every expectation below is an explicit instant and holds whatever zone the
// process runs in. The previous tests built both sides with local-time
// `new Date(y, m, d, h)`, so they agreed with each other on any machine —
// including a UTC server that stored 9 AM services at 5 PM Manila time.

it("produces only the next occurrence, on the schedule's weekday and time", () => {
  inEachProcessTimeZone(() => {
    // Thu 1 Jan 2026 — the next Sunday is the 4th, and nothing past it.
    const rows = occurrenceValues(sundayNine, manila("2026-01-01T12:00"));

    expect(rows.map((r) => r.scheduledAt)).toEqual([manila("2026-01-04T09:00")]);
    expect(rows[0].scheduleId).toBe("sched-1");
  });
});

it("keeps the meeting day's own occurrence alongside the next one", () => {
  inEachProcessTimeZone(() => {
    // Late on Sun 4 Jan, that morning's service is still produced — which is
    // what lets /scan top up and then find today's service to scan into — and
    // next Sunday's is too, so the schedule still has something upcoming.
    const rows = occurrenceValues(sundayNine, manila("2026-01-04T23:00"));

    expect(rows.map((r) => r.scheduledAt)).toEqual([
      manila("2026-01-04T09:00"),
      manila("2026-01-11T09:00"),
    ]);
  });
});

it("knows it is Sunday in Manila before it is Sunday in UTC", () => {
  inEachProcessTimeZone(() => {
    // 7 AM Sunday in Manila is still 11 PM Saturday in UTC. The church's
    // Sunday service is today's, not next week's.
    const rows = occurrenceValues(sundayNine, manila("2026-01-04T07:00"));

    expect(rows.map((r) => r.scheduledAt)).toEqual([
      manila("2026-01-04T09:00"),
      manila("2026-01-11T09:00"),
    ]);
  });
});

it("flattens every schedule into one batch of rows", () => {
  const midweek = {
    ...sundayNine,
    id: "sched-2",
    name: "Midweek Service",
    type: "midweek_service" as const,
    dayOfWeek: 3,
    timeOfDay: "18:30",
  };

  inEachProcessTimeZone(() => {
    const rows = [sundayNine, midweek].flatMap((s) =>
      occurrenceValues(s, manila("2026-01-01T12:00")),
    );

    expect(rows).toHaveLength(2);
    expect(rows[1].scheduleId).toBe("sched-2");
    expect(rows[1].scheduledAt).toEqual(manila("2026-01-07T18:30"));
  });
});
