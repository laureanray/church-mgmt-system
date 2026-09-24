import { describe, expect, it } from "bun:test";

import {
  celebrationWindow,
  celebrationYearsLabel,
  collectCelebrations,
  monthDayKeys,
  observedIn,
  parseCelebrationRange,
  type CelebrationSource,
} from "./celebrations";

function member(overrides: Partial<CelebrationSource>): CelebrationSource {
  return {
    id: "m1",
    fullName: "Maria Santos",
    status: "active",
    maritalStatus: null,
    birthdate: null,
    spiritualBirthday: null,
    weddingAnniversary: null,
    cellGroup: null,
    ...overrides,
  };
}

describe("parseCelebrationRange", () => {
  it("accepts week and month and defaults to the week", () => {
    expect(parseCelebrationRange("month")).toBe("month");
    expect(parseCelebrationRange(["month", "week"])).toBe("month");
    expect(parseCelebrationRange("year")).toBe("week");
    expect(parseCelebrationRange(undefined)).toBe("week");
  });
});

describe("celebrationWindow", () => {
  it("runs the week forward seven days from today", () => {
    expect(celebrationWindow("week", "2026-09-25")).toEqual({
      start: "2026-09-25",
      end: "2026-10-01",
    });
  });

  it("wraps the week across a year boundary", () => {
    expect(celebrationWindow("week", "2026-12-30")).toEqual({
      start: "2026-12-30",
      end: "2027-01-05",
    });
  });

  it("covers the whole calendar month", () => {
    expect(celebrationWindow("month", "2027-02-14")).toEqual({
      start: "2027-02-01",
      end: "2027-02-28",
    });
    expect(celebrationWindow("month", "2028-02-14").end).toBe("2028-02-29");
  });
});

describe("observedIn", () => {
  it("compares month and day only", () => {
    const window = { start: "2026-09-25", end: "2026-10-01" };
    expect(observedIn("1961-09-30", window)).toBe("2026-09-30");
    expect(observedIn("1961-10-02", window)).toBeNull();
  });

  it("keeps 29 February on the 28th in a non-leap year", () => {
    expect(observedIn("1992-02-29", celebrationWindow("month", "2027-02-01")))
      .toBe("2027-02-28");
    expect(observedIn("1992-02-29", { start: "2027-02-28", end: "2027-02-28" }))
      .toBe("2027-02-28");
  });

  it("keeps 29 February on the 29th in a leap year", () => {
    expect(observedIn("1992-02-29", { start: "2028-02-28", end: "2028-02-28" }))
      .toBeNull();
    expect(observedIn("1992-02-29", celebrationWindow("month", "2028-02-01")))
      .toBe("2028-02-29");
  });

  it("finds a January date from a week starting in December", () => {
    const window = celebrationWindow("week", "2026-12-30");
    expect(observedIn("1985-01-02", window)).toBe("2027-01-02");
    expect(observedIn("1985-12-31", window)).toBe("2026-12-31");
  });
});

describe("monthDayKeys", () => {
  it("lists the window's month-days, across New Year", () => {
    expect(monthDayKeys(celebrationWindow("week", "2026-12-30"))).toEqual([
      1230, 1231, 101, 102, 103, 104, 105,
    ]);
  });

  it("adds 29 February when the 28th stands in for it", () => {
    expect(monthDayKeys({ start: "2027-02-27", end: "2027-03-01" })).toEqual([
      227, 228, 229, 301,
    ]);
    expect(monthDayKeys({ start: "2028-02-27", end: "2028-03-01" })).toEqual([
      227, 228, 229, 301,
    ]);
    expect(monthDayKeys({ start: "2028-02-28", end: "2028-02-28" })).toEqual([
      228,
    ]);
  });
});

describe("collectCelebrations", () => {
  const week = celebrationWindow("week", "2026-12-30");

  it("returns every kind in the window, soonest first, with the years", () => {
    const rows = collectCelebrations(
      [
        member({
          id: "a",
          fullName: "Ana Cruz",
          maritalStatus: "married",
          birthdate: "1990-01-02",
          weddingAnniversary: "2015-12-31",
          cellGroup: { id: "c1", name: "Kabataan" },
        }),
        member({
          id: "b",
          fullName: "Ben Reyes",
          spiritualBirthday: "2020-12-30",
        }),
      ],
      week,
    );

    expect(
      rows.map((r) => [r.fullName, r.kind, r.observedOn, r.years]),
    ).toEqual([
      ["Ben Reyes", "spiritual_birthday", "2026-12-30", 6],
      ["Ana Cruz", "wedding_anniversary", "2026-12-31", 11],
      ["Ana Cruz", "birthday", "2027-01-02", 37],
    ]);
    expect(rows[2].cellGroup).toEqual({ id: "c1", name: "Kabataan" });
    expect(new Set(rows.map((r) => r.key)).size).toBe(3);
  });

  it("shows a 29 February birthday on 28 February 2027", () => {
    const [row] = collectCelebrations(
      [member({ birthdate: "1992-02-29" })],
      celebrationWindow("week", "2027-02-25"),
    );
    expect(row.observedOn).toBe("2027-02-28");
    expect(row.years).toBe(35);
  });

  it("never shows an anniversary for someone not married", () => {
    for (const maritalStatus of ["single", "divorced", null] as const) {
      const rows = collectCelebrations(
        [member({ maritalStatus, weddingAnniversary: "2015-12-31" })],
        week,
      );
      expect(rows).toEqual([]);
    }
    for (const maritalStatus of ["married", "widowed", "separated"] as const) {
      const rows = collectCelebrations(
        [member({ maritalStatus, weddingAnniversary: "2015-12-31" })],
        week,
      );
      expect(rows.map((r) => r.kind)).toEqual(["wedding_anniversary"]);
    }
  });

  it("leaves out transferred and deceased members", () => {
    const rows = collectCelebrations(
      [
        member({ id: "t", status: "transferred", birthdate: "1990-12-31" }),
        member({ id: "d", status: "deceased", birthdate: "1990-12-31" }),
        member({ id: "i", status: "inactive", birthdate: "1990-12-31" }),
        member({ id: "v", status: "visitor", birthdate: "1990-12-31" }),
      ],
      week,
    );
    expect(rows.map((r) => r.memberId)).toEqual(["i", "v"]);
  });

  it("gives no count when the date is this year or later", () => {
    const [row] = collectCelebrations(
      [member({ spiritualBirthday: "2026-12-31" })],
      week,
    );
    expect(row.years).toBeNull();
  });
});

describe("celebrationYearsLabel", () => {
  it("words the count for its kind", () => {
    expect(celebrationYearsLabel("birthday", 34)).toBe("Turns 34");
    expect(celebrationYearsLabel("wedding_anniversary", 1)).toBe("1 year");
    expect(celebrationYearsLabel("spiritual_birthday", 12)).toBe("12 years");
    expect(celebrationYearsLabel("birthday", null)).toBeNull();
  });
});
