import { describe, expect, test } from "bun:test";

import { branchSlug, parseWorktrees, removalReason, rewriteLoopbackUrl } from "./irm";

describe("parseWorktrees", () => {
  test("preserves paths with spaces and branch metadata", () => {
    expect(parseWorktrees(`worktree /tmp/church repo\nHEAD abc123\nbranch refs/heads/main\n\nworktree /tmp/feature\nHEAD def456\ndetached\nlocked in use\n`)).toEqual([
      { path: "/tmp/church repo", head: "abc123", branch: "main", detached: false, locked: undefined, prunable: undefined },
      { path: "/tmp/feature", head: "def456", branch: undefined, detached: true, locked: "in use", prunable: undefined },
    ]);
  });
});

describe("branchSlug", () => {
  test("turns a conventional branch into a safe nested directory", () => {
    expect(branchSlug("feat/Member Import/v2")).toBe("member-import-v2");
  });
});

describe("rewriteLoopbackUrl", () => {
  test("rewrites only loopback hosts and keeps ports", () => {
    expect(rewriteLoopbackUrl("http://127.0.0.1:54421", "100.64.0.8")).toBe("http://100.64.0.8:54421");
    expect(rewriteLoopbackUrl("https://project.supabase.co", "100.64.0.8")).toBe("https://project.supabase.co");
  });

  test("leaves malformed values alone", () => {
    expect(rewriteLoopbackUrl("not a url", "10.0.0.2")).toBe("not a url");
  });
});

describe("removalReason", () => {
  test("allows clean merged or commit-less worktrees", () => {
    expect(removalReason({ primary: false, clean: true, branch: "feat/done", merged: true, uniqueCommits: 2 })).toBeUndefined();
    expect(removalReason({ primary: false, clean: true, branch: "feat/empty", merged: false, uniqueCommits: 0 })).toBeUndefined();
  });

  test("protects primary, dirty, detached, and unmerged work", () => {
    expect(removalReason({ primary: true, clean: true, branch: "main", merged: true, uniqueCommits: 0 })).toContain("primary");
    expect(removalReason({ primary: false, clean: false, branch: "feat/wip", merged: false, uniqueCommits: 1 })).toContain("uncommitted");
    expect(removalReason({ primary: false, clean: true, merged: false, uniqueCommits: 0 })).toContain("detached");
    expect(removalReason({ primary: false, clean: true, branch: "feat/wip", merged: false, uniqueCommits: 3 })).toContain("3 commit");
  });
});

