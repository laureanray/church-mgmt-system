import { describe, expect, it } from "bun:test";

import {
  formatRanges,
  inDirs,
  mergeCoverage,
  parseLcov,
  percent,
  summarize,
  totals,
} from "./lcov";

const UNIT = `TN:
SF:lib/a.ts
FNF:2
FNH:1
DA:1,1
DA:2,0
DA:3,0
LF:3
LH:1
end_of_record
SF:lib/only-unit.ts
FNF:1
FNH:1
DA:1,4
end_of_record
`;

const INTEGRATION = `SF:lib/a.ts
FNF:2
FNH:2
DA:1,0
DA:2,3
DA:3,0
DA:4,1
end_of_record
SF:server/b.ts
FNF:0
FNH:0
DA:7,0
end_of_record
`;

describe("parseLcov", () => {
  it("reads each file's line hits and function counts", () => {
    const [a, onlyUnit] = parseLcov(UNIT, "unit");
    expect(a.file).toBe("lib/a.ts");
    expect([...a.lines]).toEqual([[1, 1], [2, 0], [3, 0]]);
    expect(a).toMatchObject({ funcsFound: 2, funcsHit: 1, suites: ["unit"] });
    expect(onlyUnit.lines.get(1)).toBe(4);
  });

  it("ignores anything outside a record", () => {
    expect(parseLcov("DA:1,1\nend_of_record\n", "unit")).toEqual([]);
  });
});

describe("mergeCoverage", () => {
  const merged = mergeCoverage(parseLcov(UNIT, "unit"), parseLcov(INTEGRATION, "integration"));
  const byFile = Object.fromEntries(merged.map((r) => [r.file, r]));

  it("counts a line covered when any suite ran it", () => {
    expect(summarize(byFile["lib/a.ts"])).toEqual({
      linesFound: 4,
      linesHit: 3,
      funcsFound: 2,
      funcsHit: 2,
      uncovered: [3],
    });
  });

  it("drops lines only a coarse, never-run listing claims", () => {
    // Unit ran the function and lists only its code; integration never ran
    // it, so it lists the whole body — blank line 11 included.
    const precise = parseLcov("SF:lib/f.ts\nDA:10,1\nDA:12,1\nend_of_record\n", "unit");
    const coarse = parseLcov("SF:lib/f.ts\nDA:10,0\nDA:11,0\nDA:12,0\nend_of_record\n", "integration");
    const [f] = mergeCoverage(precise, coarse);
    expect([...f.lines]).toEqual([[10, 1], [12, 1]]);
  });

  it("lists several uncovered lines in order", () => {
    const [h] = mergeCoverage(parseLcov("SF:lib/h.ts\nDA:9,0\nDA:2,0\nDA:5,1\nend_of_record\n", "unit"));
    expect(summarize(h).uncovered).toEqual([2, 9]);
  });

  it("keeps a line nobody ran when every suite lists it", () => {
    const one = parseLcov("SF:lib/g.ts\nDA:5,0\nend_of_record\n", "unit");
    const two = parseLcov("SF:lib/g.ts\nDA:5,0\nDA:6,2\nend_of_record\n", "integration");
    const [g] = mergeCoverage(one, two);
    expect([...g.lines]).toEqual([[5, 0], [6, 2]]);
  });

  it("names the suites that loaded each file, in the order given", () => {
    expect(byFile["lib/a.ts"].suites).toEqual(["unit", "integration"]);
    expect(byFile["lib/only-unit.ts"].suites).toEqual(["unit"]);
    expect(byFile["server/b.ts"].suites).toEqual(["integration"]);
  });

  it("sorts by path and leaves its inputs alone", () => {
    expect(merged.map((r) => r.file)).toEqual(["lib/a.ts", "lib/only-unit.ts", "server/b.ts"]);
    const unit = parseLcov(UNIT, "unit");
    mergeCoverage(unit, parseLcov(INTEGRATION, "integration"));
    expect(unit[0].lines.get(2)).toBe(0);
  });

  it("totals the merged files", () => {
    expect(totals(merged)).toEqual({ linesFound: 6, linesHit: 4, funcsFound: 3, funcsHit: 3 });
  });
});

describe("formatting", () => {
  it("collapses runs of lines, and caps how many ranges it lists", () => {
    expect(formatRanges([58, 41, 43, 42])).toBe("41-43, 58");
    expect(formatRanges([1, 3, 5, 7], 2)).toBe("1, 3, +2 more");
    expect(formatRanges([])).toBe("");
  });

  it("shows a percentage, or a dash when there is nothing to count", () => {
    expect(percent(1, 3)).toBe("33.33%");
    expect(percent(0, 0)).toBe("—");
  });

  it("matches files by directory, not by prefix", () => {
    expect(inDirs("lib/a.ts", ["lib", "server"])).toBe(true);
    expect(inDirs("server/b.ts", ["lib", "server"])).toBe(true);
    expect(inDirs("library/a.ts", ["lib"])).toBe(false);
    expect(inDirs("db/schema.ts", ["lib", "server"])).toBe(false);
  });
});
