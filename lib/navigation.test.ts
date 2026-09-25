import { describe, expect, test } from "bun:test";

import {
  NAV_SECTIONS,
  activeNavHref,
  firstAccessibleHref,
  visibleNavSections,
} from "./navigation";
import { isPermissionKey } from "./permissions";

describe("navigation", () => {
  test("gates every entry on a real catalog permission", () => {
    for (const item of NAV_SECTIONS.flatMap((section) => section.items)) {
      expect(isPermissionKey(item.permission)).toBe(true);
    }
  });

  test("drops sections with nothing visible", () => {
    const sections = visibleNavSections({
      permissions: ["dashboard.view", "lam.view"],
      ministryCount: 0,
    });
    expect(sections.map((section) => section.label)).toEqual(["Menu", "LAM"]);
    expect(sections[0].items.map((item) => item.href)).toEqual(["/dashboard"]);
  });

  test("shows Ministries to anyone on a roster", () => {
    const hrefs = visibleNavSections({ permissions: [], ministryCount: 1 })
      .flatMap((section) => section.items)
      .map((item) => item.href);
    expect(hrefs).toEqual(["/ministries"]);
  });

  test("lands a ministry-only volunteer on their first module", () => {
    expect(
      firstAccessibleHref({ permissions: ["lam.view"], ministryCount: 1 }),
    ).toBe("/ministries");
    expect(
      firstAccessibleHref({ permissions: ["lam.view"], ministryCount: 0 }),
    ).toBe("/lam");
    expect(firstAccessibleHref({ permissions: [], ministryCount: 0 })).toBeNull();
  });

  test("highlights only the most specific matching entry", () => {
    const hrefs = ["/lam", "/lam/songs", "/members"];
    expect(activeNavHref("/lam/songs/abc/edit", hrefs)).toBe("/lam/songs");
    expect(activeNavHref("/lam/services/abc", hrefs)).toBe("/lam");
    expect(activeNavHref("/members", hrefs)).toBe("/members");
    expect(activeNavHref("/lamb", hrefs)).toBeUndefined();
  });
});
