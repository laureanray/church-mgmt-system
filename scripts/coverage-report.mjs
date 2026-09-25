// Turns the suites' lcov files into a markdown summary for the GitHub job
// summary and the pull request comment. Bun's lcov carries line and function
// hits only — there is no branch data to report.
//
//   bun scripts/coverage-report.mjs                    # coverage/unit.lcov + coverage/integration.lcov
//   bun scripts/coverage-report.mjs unit=path/a.lcov integration=path/b.lcov
//
// The unit suite alone cannot reach code that talks to the database; the
// integration suite runs it against Postgres. Merged, a line counts as covered
// when either suite ran it. The parsing and merging live in lib/lcov.ts.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import {
  formatRanges,
  inDirs,
  mergeCoverage,
  parseLcov,
  percent,
  summarize,
  totals,
} from "../lib/lcov.ts";

/** The directories the report covers: shared logic, and the service layer. */
const SOURCE_DIRS = ["lib", "server"];

function inputs() {
  const given = process.argv.slice(2).map((arg) => {
    const [suite, path] = arg.includes("=") ? arg.split("=", 2) : ["unit", arg];
    return { suite, path };
  });
  if (given.length > 0) return given;
  // `bun run test:coverage` alone leaves coverage/lcov.info; CI renames each
  // suite's file as it goes.
  if (!existsSync("coverage/unit.lcov")) return [{ suite: "unit", path: "coverage/lcov.info" }];
  return [
    { suite: "unit", path: "coverage/unit.lcov" },
    { suite: "integration", path: "coverage/integration.lcov" },
  ];
}

/** Every non-test source file under the report's directories. */
function listSourceFiles(dirs) {
  const files = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
      if (!entry.isFile()) continue;
      const name = entry.name;
      if (!name.endsWith(".ts") && !name.endsWith(".tsx")) continue;
      if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) continue;
      files.push(relative(".", join(entry.parentPath ?? dir, name)));
    }
  }
  return files.sort();
}

const runs = inputs();
const present = runs.filter((run) => existsSync(run.path));
const missing = runs.filter((run) => !existsSync(run.path));

if (present.length === 0) {
  console.log("## Coverage\n\nNo coverage data — no suite produced a report.");
  process.exit(0);
}

const records = mergeCoverage(
  ...present.map((run) => parseLcov(readFileSync(run.path, "utf8"), run.suite)),
).filter((record) => inDirs(record.file, SOURCE_DIRS));
const sum = totals(records);

const loaded = new Set(records.map((record) => record.file));
const untouched = listSourceFiles(SOURCE_DIRS).filter((file) => !loaded.has(file));
const suiteNames = present.map((run) => run.suite).join(" + ");

const out = [];
out.push("## Coverage");
out.push("");
out.push(
  `**${percent(sum.linesHit, sum.linesFound)} of lines** (${sum.linesHit}/${sum.linesFound}) · ` +
    `**${percent(sum.funcsHit, sum.funcsFound)} of functions** (${sum.funcsHit}/${sum.funcsFound}) · ${suiteNames}`,
);
out.push("");
if (missing.length > 0) {
  out.push(
    `> No ${missing.map((run) => run.suite).join(" or ")} coverage this run (the suite failed or did not run), ` +
      "so code only it reaches shows as uncovered.",
  );
  out.push("");
}
out.push("| File | Lines | Functions | Uncovered lines | Suites |");
out.push("| --- | ---: | ---: | --- | --- |");
for (const record of records) {
  const s = summarize(record);
  out.push(
    `| \`${record.file}\` | ${percent(s.linesHit, s.linesFound)} | ${percent(s.funcsHit, s.funcsFound)} | ` +
      `${formatRanges(s.uncovered) || "—"} | ${record.suites.join(", ")} |`,
  );
}
out.push("");

if (untouched.length > 0) {
  out.push(
    `<details><summary>${untouched.length} file(s) under ${SOURCE_DIRS.map((d) => `<code>${d}/</code>`).join(" and ")} that no test loads</summary>`,
  );
  out.push("");
  for (const file of untouched) out.push(`- \`${file}\``);
  out.push("");
  out.push("</details>");
  out.push("");
}

out.push(
  `<sub>${suiteNames} suites, merged: a line is covered when any of them ran it. Functions are the best ` +
    "single suite's count, since Bun's lcov does not say which functions ran. Bun measures only files a test " +
    "loads, so untested files are listed rather than counted. E2E and UI runs are not included.</sub>",
);

console.log(out.join("\n"));
