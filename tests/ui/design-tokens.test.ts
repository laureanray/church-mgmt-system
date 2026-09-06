import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Glob } from "bun";

/**
 * The guardrail behind `app/globals.css`: colour enters a component through a
 * semantic token or not at all.
 *
 * A literal — `text-amber-600 dark:text-amber-400`, `#10b981` — looks correct
 * in whichever theme its author happened to be in and is invisible to a
 * rebrand. This scan is what stops one from being reintroduced; the failure it
 * prints names the file so the fix is obvious.
 */

// Tailwind's built-in palette. Semantic names (primary, muted, destructive,
// success, warning, info, chart-N…) are not in this list and are the point.
const PALETTE =
  "(?:slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)";
const PALETTE_UTILITY = new RegExp(
  `\\b(?:text|bg|border|fill|stroke|ring|from|via|to|divide|outline|shadow|accent|decoration|caret)-${PALETTE}-\\d{2,3}\\b`,
  "g",
);
const HEX_LITERAL = /#[0-9a-fA-F]{3,8}\b/g;

// Documents rendered outside the app shell, where a CSS custom property has
// nothing to resolve against.
const EXEMPT = new Set([
  // Printed on a popup window with its own document and no stylesheet.
  "components/members/member-qr.tsx",
  // A QR code has to be true black on true white whatever the theme, or camera
  // scanners lose the contrast they decode from.
  "lib/qr.ts",
  // Documents the rule it enforces, in prose and in a counter-example.
  "components/ui/badge.stories.tsx",
]);

function sourceFiles(): string[] {
  const files: string[] = [];
  for (const dir of ["app", "components", "lib"]) {
    for (const file of new Glob("**/*.{ts,tsx}").scanSync(dir)) {
      const path = `${dir}/${file}`;
      if (!EXEMPT.has(path)) files.push(path);
    }
  }
  return files.sort();
}

function offences(pattern: RegExp): string[] {
  const found: string[] = [];
  for (const path of sourceFiles()) {
    const source = readFileSync(path, "utf8");
    for (const [index, line] of source.split("\n").entries()) {
      for (const match of line.matchAll(pattern)) {
        found.push(`${path}:${index + 1}  ${match[0]}`);
      }
    }
  }
  return found;
}

describe("design tokens", () => {
  test("scans a non-trivial number of files", () => {
    // Guards the guard: a broken glob would make both checks below vacuous.
    expect(sourceFiles().length).toBeGreaterThan(50);
  });

  test("no component reaches past the tokens into Tailwind's palette", () => {
    expect(offences(PALETTE_UTILITY)).toEqual([]);
  });

  test("no component hardcodes a hex colour", () => {
    expect(offences(HEX_LITERAL)).toEqual([]);
  });
});
