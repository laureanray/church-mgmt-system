// Reading and combining lcov coverage files, for scripts/coverage-report.mjs.
// The unit suite and the integration suite each write one; merged, they say
// which lines any test ran — database code that only the integration suite
// can reach included. Pure, so it is covered by lib/lcov.test.ts.

export type CoverageRecord = {
  file: string;
  /** Hits per executable line. */
  lines: Map<number, number>;
  funcsFound: number;
  funcsHit: number;
  /** Which suites loaded the file, e.g. ["unit", "integration"]. */
  suites: string[];
};

/** Parse one lcov file. Bun writes SF, FNF, FNH, DA, LF, LH and end_of_record. */
export function parseLcov(text: string, suite: string): CoverageRecord[] {
  const records: CoverageRecord[] = [];
  let current: CoverageRecord | null = null;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("SF:")) {
      current = { file: line.slice(3), lines: new Map(), funcsFound: 0, funcsHit: 0, suites: [suite] };
    } else if (!current) {
      continue;
    } else if (line.startsWith("FNF:")) {
      current.funcsFound = Number(line.slice(4));
    } else if (line.startsWith("FNH:")) {
      current.funcsHit = Number(line.slice(4));
    } else if (line.startsWith("DA:")) {
      const [lineNumber, hits] = line.slice(3).split(",");
      current.lines.set(Number(lineNumber), Number(hits));
    } else if (line === "end_of_record") {
      records.push(current);
      current = null;
    }
  }
  return records;
}

/**
 * Combine the suites' records per file.
 *
 * The suites cannot simply be unioned line by line. For a function it never
 * ran, Bun lists every line of the body as uncovered, blank lines and comments
 * included; for one it ran, only the lines that are really code. So a line
 * counts when every suite that loaded the file lists it — the precise suite
 * decides — or when any suite ran it. Hits add up.
 *
 * Bun's lcov carries only function *counts*, not which functions ran, so a
 * file's functions are the best any one suite managed: never overstated,
 * possibly understated.
 */
export function mergeCoverage(...runs: CoverageRecord[][]): CoverageRecord[] {
  const byFile = new Map<string, CoverageRecord[]>();
  for (const record of runs.flat()) {
    const group = byFile.get(record.file);
    if (group) group.push(record);
    else byFile.set(record.file, [record]);
  }

  const merged: CoverageRecord[] = [];
  for (const [file, group] of byFile) {
    const lines = new Map<number, number>();
    const candidates = new Set(group.flatMap((record) => [...record.lines.keys()]));
    for (const line of [...candidates].sort((a, b) => a - b)) {
      const hits = group.reduce((sum, record) => sum + (record.lines.get(line) ?? 0), 0);
      const listedByAll = group.every((record) => record.lines.has(line));
      if (hits > 0 || listedByAll) lines.set(line, hits);
    }
    merged.push({
      file,
      lines,
      funcsFound: Math.max(...group.map((record) => record.funcsFound)),
      funcsHit: Math.max(...group.map((record) => record.funcsHit)),
      suites: [...new Set(group.flatMap((record) => record.suites))],
    });
  }
  return merged.sort((a, b) => a.file.localeCompare(b.file));
}

export type CoverageSummary = {
  linesFound: number;
  linesHit: number;
  funcsFound: number;
  funcsHit: number;
  uncovered: number[];
};

export function summarize(record: CoverageRecord): CoverageSummary {
  const uncovered = [...record.lines]
    .filter(([, hits]) => hits === 0)
    .map(([line]) => line)
    .sort((a, b) => a - b);
  return {
    linesFound: record.lines.size,
    linesHit: record.lines.size - uncovered.length,
    funcsFound: record.funcsFound,
    funcsHit: record.funcsHit,
    uncovered,
  };
}

export function totals(records: CoverageRecord[]): Omit<CoverageSummary, "uncovered"> {
  return records.map(summarize).reduce(
    (sum, s) => ({
      linesFound: sum.linesFound + s.linesFound,
      linesHit: sum.linesHit + s.linesHit,
      funcsFound: sum.funcsFound + s.funcsFound,
      funcsHit: sum.funcsHit + s.funcsHit,
    }),
    { linesFound: 0, linesHit: 0, funcsFound: 0, funcsHit: 0 },
  );
}

/** Collapses [41, 42, 43, 58] into "41-43, 58", the way bun's text reporter does. */
export function formatRanges(lines: number[], maxRanges = 8): string {
  const sorted = [...lines].sort((a, b) => a - b);
  const ranges: [number, number][] = [];
  for (const line of sorted) {
    const last = ranges.at(-1);
    if (last && line === last[1] + 1) last[1] = line;
    else ranges.push([line, line]);
  }
  const shown = ranges
    .slice(0, maxRanges)
    .map(([start, end]) => (start === end ? `${start}` : `${start}-${end}`));
  if (ranges.length > maxRanges) shown.push(`+${ranges.length - maxRanges} more`);
  return shown.join(", ");
}

export function percent(hit: number, found: number): string {
  return found === 0 ? "—" : `${((hit / found) * 100).toFixed(2)}%`;
}

/** Whether `file` sits under one of `dirs` (repository-relative paths). */
export function inDirs(file: string, dirs: readonly string[]): boolean {
  return dirs.some((dir) => file === dir || file.startsWith(`${dir}/`));
}
