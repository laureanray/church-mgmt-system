import { describe, expect, test } from "bun:test";
import { Glob } from "bun";

/**
 * Storybook expects `args` to be JSON-serializable: they are round-tripped
 * through the manager/preview channel, shown in Controls, and encoded into
 * shareable URLs.
 *
 * Two things break that rule and both are easy to write by accident — a React
 * element (which also carries a cycle through `_owner` in development builds,
 * and makes Storybook log a warning) and a component reference such as
 * `icon: Users`. Neither crashes, which is exactly why this needs a test:
 * the symptom is a dead control and a lossy URL, not a failure.
 *
 * Build those props inside the story's `render` instead.
 */

const STORY_DIRS = [".storybook", "components"];

type Offence = { story: string; arg: string; kind: string };

function classify(value: unknown): string | null {
  if (typeof value === "function") return "component or function";
  if (typeof value === "object" && value !== null) {
    if ("$$typeof" in value) return "React element";
    for (const nested of Object.values(value)) {
      if (classify(nested)) return "nested non-serializable value";
    }
  }
  return null;
}

async function storyFiles(): Promise<string[]> {
  const files: string[] = [];
  for (const dir of STORY_DIRS) {
    for (const file of new Glob("**/*.stories.tsx").scanSync(dir)) {
      files.push(`${dir}/${file}`);
    }
  }
  return files.sort();
}

async function offences(): Promise<Offence[]> {
  const found: Offence[] = [];
  for (const path of await storyFiles()) {
    const mod = (await import(`${process.cwd()}/${path}`)) as Record<
      string,
      { args?: Record<string, unknown> } | undefined
    >;
    for (const [exportName, value] of Object.entries(mod)) {
      const args = value?.args;
      if (!args) continue;
      const label = exportName === "default" ? "meta" : exportName;
      for (const [arg, argValue] of Object.entries(args)) {
        const kind = classify(argValue);
        if (kind) found.push({ story: `${path} › ${label}`, arg, kind });
      }
    }
  }
  return found;
}

describe("story args", () => {
  test("every story file is discovered", async () => {
    // Guards the guard: a broken glob would make the check below vacuous.
    expect((await storyFiles()).length).toBeGreaterThan(10);
  });

  test("no story passes a component or element as an arg", async () => {
    expect(await offences()).toEqual([]);
  });
});
