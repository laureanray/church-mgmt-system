import { describe, expect, it } from "bun:test";

import {
  addDays,
  anniversaryIn,
  dateParts,
  datesBetween,
  daysInMonth,
  isLeapYear,
  isoDate,
  todayIn,
  weekdayOf,
} from "./dates";

describe("dateParts and isoDate", () => {
  it("round-trip a date-only string with a 1-based month", () => {
    expect(dateParts("2027-01-02")).toEqual({ year: 2027, month: 1, day: 2 });
    expect(isoDate(2027, 1, 2)).toBe("2027-01-02");
    expect(isoDate(99, 12, 31)).toBe("0099-12-31");
  });
});

describe("todayIn", () => {
  it("reads the date in the church's timezone, not on the server's clock", () => {
    // 20:00 UTC on 31 Dec is already 1 Jan in Manila.
    const now = new Date("2026-12-31T20:00:00Z");
    expect(todayIn(undefined, now)).toBe("2027-01-01");
    expect(todayIn("UTC", now)).toBe("2026-12-31");
  });
});

describe("isLeapYear and daysInMonth", () => {
  it("follow the Gregorian century rule", () => {
    expect([2024, 2027, 2000, 1900].map(isLeapYear)).toEqual([
      true,
      false,
      true,
      false,
    ]);
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe("addDays and datesBetween", () => {
  it("cross month and year boundaries", () => {
    expect(addDays("2026-12-30", 6)).toBe("2027-01-05");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
    expect(datesBetween("2026-12-30", "2027-01-02")).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
    expect(datesBetween("2027-01-02", "2027-01-01")).toEqual([]);
  });
});

describe("anniversaryIn", () => {
  it("keeps the month and day in the given year", () => {
    expect(anniversaryIn("1985-01-02", 2027)).toBe("2027-01-02");
  });

  it("moves 29 February to the 28th only in a common year", () => {
    expect(anniversaryIn("1992-02-29", 2027)).toBe("2027-02-28");
    expect(anniversaryIn("1992-02-29", 2028)).toBe("2028-02-29");
  });
});

describe("weekdayOf", () => {
  it("numbers weekdays from Sunday, like Date.getDay()", () => {
    expect(weekdayOf("2026-09-27")).toBe(0);
    expect(weekdayOf("2026-09-26")).toBe(6);
    expect(weekdayOf("2024-02-29")).toBe(4);
  });
});
