import { describe, expect, it } from "bun:test";

import { inEachProcessTimeZone } from "../tests/support/time-zones";
import {
  parseChurchDateTime,
  toChurchDateTimeLocal,
  wallClock,
  zonedInstant,
} from "./church-time";

describe("zonedInstant", () => {
  it("reads a wall-clock time as Manila's, whatever zone the process is in", () => {
    inEachProcessTimeZone(() => {
      expect(zonedInstant("2026-09-27", "09:00").toISOString()).toBe(
        "2026-09-27T01:00:00.000Z",
      );
      // Before 8 AM in Manila it is still the previous day in UTC.
      expect(zonedInstant("2026-09-27", "07:30").toISOString()).toBe(
        "2026-09-26T23:30:00.000Z",
      );
      expect(zonedInstant("2027-01-01", "00:00").toISOString()).toBe(
        "2026-12-31T16:00:00.000Z",
      );
    });
  });

  it("follows a named zone across a daylight-saving change", () => {
    // New York springs forward on 8 March 2026: 9 AM is EST before, EDT after.
    expect(zonedInstant("2026-03-07", "09:00", "America/New_York").toISOString()).toBe(
      "2026-03-07T14:00:00.000Z",
    );
    expect(zonedInstant("2026-03-09", "09:00", "America/New_York").toISOString()).toBe(
      "2026-03-09T13:00:00.000Z",
    );
  });
});

describe("wallClock", () => {
  it("shows an instant as Manila's date, time and weekday", () => {
    inEachProcessTimeZone(() => {
      expect(wallClock(new Date("2026-09-26T23:30:00Z"))).toEqual({
        date: "2026-09-27",
        time: "07:30",
        weekday: 0,
      });
      expect(wallClock(new Date("2026-12-31T16:00:00Z"))).toEqual({
        date: "2027-01-01",
        time: "00:00",
        weekday: 5,
      });
    });
  });

  it("round-trips with zonedInstant", () => {
    const { date, time } = wallClock(new Date("2026-09-27T01:00:00Z"));
    expect(zonedInstant(date, time).toISOString()).toBe("2026-09-27T01:00:00.000Z");
  });
});

describe("datetime-local values", () => {
  it("parse as church time, not the server's", () => {
    inEachProcessTimeZone(() => {
      expect(parseChurchDateTime("2026-09-27T09:00")?.toISOString()).toBe(
        "2026-09-27T01:00:00.000Z",
      );
    });
  });

  it("ignore seconds and reject what is not a date and time", () => {
    expect(parseChurchDateTime("2026-09-27T09:00:30")?.toISOString()).toBe(
      "2026-09-27T01:00:00.000Z",
    );
    expect(parseChurchDateTime("2026-09-27")).toBeNull();
    expect(parseChurchDateTime("")).toBeNull();
  });

  it("fill the input with the time the church sees, so saving unchanged changes nothing", () => {
    inEachProcessTimeZone(() => {
      const stored = new Date("2026-09-27T01:00:00Z");
      const shown = toChurchDateTimeLocal(stored);
      expect(shown).toBe("2026-09-27T09:00");
      expect(parseChurchDateTime(shown)?.getTime()).toBe(stored.getTime());
    });
  });
});

describe("parseChurchDateTime refuses what the calendar does not have", () => {
  it.each([
    ["30 February", "2026-02-30T09:00"],
    ["month 13", "2026-13-01T09:00"],
    ["hour 25", "2026-01-01T25:00"],
    ["minute 61", "2026-01-01T09:61"],
    ["day 0", "2026-01-00T09:00"],
  ])("%s", (_label, value) => {
    expect(parseChurchDateTime(value)).toBeNull();
  });

  it("still reads a real date, a leap day included, in church time", () => {
    expect(parseChurchDateTime("2028-02-29T09:00")?.toISOString()).toBe("2028-02-29T01:00:00.000Z");
    expect(parseChurchDateTime("2026-12-31T23:59")?.toISOString()).toBe("2026-12-31T15:59:00.000Z");
  });
});
