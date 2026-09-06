// Turns `coverage/lcov.info` into a markdown summary for the GitHub job summary
// and the pull request comment. Bun's lcov carries line and function hits only —
// there is no branch data to report.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const LCOV_PATH = process.argv[2] ?? "coverage/lcov.info";
const SOURCE_DIR = "lib";

/** @returns {{file: string, funcsFound: number, funcsHit: number, linesFound: number, linesHit: number, uncovered: number[]}[]} */
function parseLcov(text) {
  const records = [];
  let current = null;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("SF:")) {
      current = {
        file: line.slice(3),
        funcsFound: 0,
        funcsHit: 0,
        linesFound: 0,
        linesHit: 0,
        uncovered: [],
      };
    } else if (!current) {
      continue;
    } else if (line.startsWith("FNF:")) {
      current.funcsFound = Number(line.slice(4));
    } else if (line.startsWith("FNH:")) {
      current.funcsHit = Number(line.slice(4));
    } else if (line.startsWith("LF:")) {
      current.linesFound = Number(line.slice(3));
    } else if (line.startsWith("LH:")) {
      current.linesHit = Number(line.slice(3));
    } else if (line.startsWith("DA:")) {
      const [lineNumber, hits] = line.slice(3).split(",");
      if (Number(hits) === 0) current.uncovered.push(Number(lineNumber));
    } else if (line === "end_of_record") {
      records.push(current);
      current = null;
    }
  }
  return records;
}

/** Collapses [41, 42, 43, 58] into "41-43, 58", the way bun's text reporter does. */
function formatRanges(lines, maxRanges = 8) {
  const sorted = [...lines].sort((a, b) => a - b);
  const ranges = [];
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

const percent = (hit, found) => (found === 0 ? "—" : `${((hit / found) * 100).toFixed(2)}%`);

/** Every non-test source file under lib/, so the report can name what tests never loaded. */
function listSourceFiles(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (!name.endsWith(".ts") && !name.endsWith(".tsx")) continue;
    if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) continue;
    files.push(relative(".", join(entry.parentPath ?? dir, name)));
  }
  return files.sort();
}

if (!existsSync(LCOV_PATH)) {
  console.log(`## Coverage\n\nNo coverage data at \`${LCOV_PATH}\` — the unit suite did not produce a report.`);
  process.exit(0);
}

const records = parseLcov(readFileSync(LCOV_PATH, "utf8")).sort((a, b) =>
  a.file.localeCompare(b.file),
);
const totals = records.reduce(
  (sum, record) => ({
    funcsFound: sum.funcsFound + record.funcsFound,
    funcsHit: sum.funcsHit + record.funcsHit,
    linesFound: sum.linesFound + record.linesFound,
    linesHit: sum.linesHit + record.linesHit,
  }),
  { funcsFound: 0, funcsHit: 0, linesFound: 0, linesHit: 0 },
);

const covered = new Set(records.map((record) => record.file));
const untouched = listSourceFiles(SOURCE_DIR).filter((file) => !covered.has(file));

const out = [];
out.push("## Coverage");
out.push("");
out.push(
  `**${percent(totals.linesHit, totals.linesFound)} of lines** (${totals.linesHit}/${totals.linesFound}) · ` +
    `**${percent(totals.funcsHit, totals.funcsFound)} of functions** (${totals.funcsHit}/${totals.funcsFound})`,
);
out.push("");
out.push("| File | Lines | Functions | Uncovered lines |");
out.push("| --- | ---: | ---: | --- |");
for (const record of records) {
  out.push(
    `| \`${record.file}\` | ${percent(record.linesHit, record.linesFound)} | ` +
      `${percent(record.funcsHit, record.funcsFound)} | ${formatRanges(record.uncovered) || "—"} |`,
  );
}
out.push("");

if (untouched.length > 0) {
  out.push(
    `<details><summary>${untouched.length} file(s) under <code>${SOURCE_DIR}/</code> that no unit test loads</summary>`,
  );
  out.push("");
  for (const file of untouched) out.push(`- \`${file}\``);
  out.push("");
  out.push("</details>");
  out.push("");
}

out.push(
  "<sub>Unit suite only (`bun test --coverage lib`). Bun measures files a test actually imports, " +
    "so the percentages above describe the loaded files listed here — not all of `lib/`, and not code " +
    "exercised solely by the integration or E2E suites.</sub>",
);

console.log(out.join("\n"));
