import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Glob } from "bun";

/**
 * Every page in the app group starts at the same left edge and, unless it is a
 * form, fills the same width — so opening a record from its list never narrows
 * the page or shifts the title. `PageContainer` is where that width lives; a
 * page setting its own `max-w-*` or centring itself with `mx-auto` is how the
 * service page drifted from the services table before.
 */

const ROOT = "app/(app)";

function pages(): string[] {
  return [...new Glob("**/{page,loading}.tsx").scanSync(ROOT)]
    .map((file) => `${ROOT}/${file}`)
    .sort();
}

describe("page width", () => {
  test("finds the app group's pages", () => {
    expect(pages().length).toBeGreaterThan(10);
  });

  test.each(pages())("%s renders through PageContainer", (path) => {
    expect(readFileSync(path, "utf8")).toContain("<PageContainer");
  });

  test.each(pages())("%s sets no page width of its own", (path) => {
    const source = readFileSync(path, "utf8");
    expect(source).not.toMatch(/className="[^"]*\bmx-auto\b/);
    expect(source).not.toMatch(/<(?:div|main|section)\s+className="[^"]*\bmax-w-(?:\d?xl|screen)/);
  });
});
