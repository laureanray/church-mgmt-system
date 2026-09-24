import { expect, it } from "bun:test";

import { occurrenceValues } from "./occurrences";

const sundayNine = {
  id: "sched-1",
  name: "Sunday Service",
  type: "sunday_service" as const,
  dayOfWeek: 0,
  timeOfDay: "09:00",
  location: null,
};

it("produces only the next occurrence, on the schedule's weekday and time", () => {
  // Thu 1 Jan 2026 — the next Sunday is the 4th, and nothing past it.
  const rows = occurrenceValues(sundayNine, new Date(2026, 0, 1));

  expect(rows.map((r) => r.scheduledAt)).toEqual([new Date(2026, 0, 4, 9, 0)]);
  expect(rows[0].scheduleId).toBe("sched-1");
});

it("keeps the meeting day's own occurrence alongside the next one", () => {
  // Late on Sun 4 Jan, that morning's service is still produced — which is
  // what lets /scan top up and then find today's service to scan into — and
  // next Sunday's is too, so the schedule still has something upcoming.
  const rows = occurrenceValues(sundayNine, new Date(2026, 0, 4, 23, 0));

  expect(rows.map((r) => r.scheduledAt)).toEqual([
    new Date(2026, 0, 4, 9, 0),
    new Date(2026, 0, 11, 9, 0),
  ]);
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

  const rows = [sundayNine, midweek].flatMap((s) =>
    occurrenceValues(s, new Date(2026, 0, 1)),
  );

  expect(rows).toHaveLength(2);
  expect(rows[1].scheduleId).toBe("sched-2");
  expect(rows[1].scheduledAt).toEqual(new Date(2026, 0, 7, 18, 30));
});
