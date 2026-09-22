import { describe, expect, test } from "bun:test";
import { dateFromIso, dateInputIso, dateInputText, dateToIso } from "./date-input";

describe("date-only input", () => {
  test("converts month-first entry into a date-only submission", () => {
    expect(dateInputIso(" 3/4/1988 ")).toBe("1988-03-04");
    expect(dateInputText("1988-03-04")).toBe("03/04/1988");
  });
  test("rejects impossible dates instead of rolling into another month", () => {
    for (const text of ["04/31/2026", "02/29/2025", "13/12/2026", "00/01/2026", "01/01/0000", "2026-09-21", ""])
      expect(dateInputIso(text)).toBeUndefined();
    expect(dateInputIso("02/29/2024")).toBe("2024-02-29");
  });
  test("round trips local dates without UTC or year-0-to-99 coercion", () => {
    for (const iso of ["1988-03-14", "2026-01-01", "0099-12-31"]) {
      const date = dateFromIso(iso)!;
      expect(date.getHours()).toBe(12);
      expect(dateToIso(date)).toBe(iso);
    }
    expect(dateFromIso("2026-02-30")).toBeUndefined();
  });
});
