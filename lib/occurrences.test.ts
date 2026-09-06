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

it("lands on the schedule's weekday and time, week after week", () => {
  // Thu 1 Jan 2026 — the next Sunday is the 4th.
  const rows = occurrenceValues(sundayNine, 3, new Date(2026, 0, 1));

  expect(rows.map((r) => r.scheduledAt)).toEqual([
    new Date(2026, 0, 4, 9, 0),
    new Date(2026, 0, 11, 9, 0),
    new Date(2026, 0, 18, 9, 0),
  ]);
  expect(rows.every((r) => r.scheduleId === "sched-1")).toBe(true);
});

it("treats the meeting day itself as this week's occurrence", () => {
  // Late on Sun 4 Jan, the next occurrence is still that morning's — which is
  // what lets /scan top up and then find today's service to scan into.
  const [first] = occurrenceValues(sundayNine, 1, new Date(2026, 0, 4, 23, 0));

  expect(first.scheduledAt).toEqual(new Date(2026, 0, 4, 9, 0));
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
    occurrenceValues(s, 4, new Date(2026, 0, 1)),
  );

  expect(rows).toHaveLength(8);
  expect(rows.filter((r) => r.scheduleId === "sched-2")).toHaveLength(4);
  expect(rows[4].scheduledAt).toEqual(new Date(2026, 0, 7, 18, 30));
});
