import { describe, expect, it } from "bun:test";
import {
  TIER_LEGEND,
  TIER_STYLE,
  buildCellGraph,
  wouldCreateCycle,
} from "./cell-graph";

// Network:
//   Pastor leads "Root" (no parent) and belongs to it.
//   Ana leads "Ana's Cell" (parent = Root) and belongs to it.
//   Ben is an ordinary member of "Ana's Cell".
//   Lito belongs to no cell (unassigned).
const cells = [
  { id: "root", leaderId: "pastor", parentCellGroupId: null },
  { id: "ana", leaderId: "ana", parentCellGroupId: "root" },
];
const people = [
  { id: "pastor", name: "Pastor", cellGroupId: "root" },
  { id: "ana", name: "Ana", cellGroupId: "ana" },
  { id: "ben", name: "Ben", cellGroupId: "ana" },
  { id: "lito", name: "Lito", cellGroupId: null },
];

describe("buildCellGraph", () => {
  const g = buildCellGraph(people, cells);
  const tier = (id: string) => g.nodes.find((n) => n.id === id)!.tier;

  it("flags a member with no cell as unassigned", () => {
    expect(tier("lito")).toBe("unassigned");
    expect(g.unassignedCount).toBe(1);
  });

  it("classifies the top leader who has downline leaders as leader-of-leaders", () => {
    expect(tier("pastor")).toBe("leader-of-leaders");
  });

  it("classifies a cell leader with no child cells as leader", () => {
    expect(tier("ana")).toBe("leader");
  });

  it("classifies an ordinary cell member as member", () => {
    expect(tier("ben")).toBe("member");
  });

  it("links a member to their cell leader", () => {
    expect(g.links).toContainEqual({ source: "ben", target: "ana" });
  });

  it("links a cell leader to their upline (parent cell's leader)", () => {
    expect(g.links).toContainEqual({ source: "ana", target: "pastor" });
  });

  it("gives the root leader no upline link and unassigned people no link", () => {
    expect(g.links.some((l) => l.source === "pastor")).toBe(false);
    expect(g.links.some((l) => l.source === "lito")).toBe(false);
  });

  it("counts all descendants in downlineCount", () => {
    const n = (id: string) => g.nodes.find((x) => x.id === id)!;
    expect(n("pastor").downlineCount).toBe(2); // ana + ben
    expect(n("ana").downlineCount).toBe(1); // ben
    expect(n("ben").downlineCount).toBe(0);
  });
});

describe("wouldCreateCycle", () => {
  it("rejects making a cell its own parent", () => {
    expect(wouldCreateCycle("root", "root", cells)).toBe(true);
  });
  it("rejects making a cell a child of its own descendant", () => {
    // root's parent set to ana (ana is root's descendant) -> cycle
    expect(wouldCreateCycle("root", "ana", cells)).toBe(true);
  });
  it("allows a valid new parent", () => {
    expect(wouldCreateCycle("ana", null, cells)).toBe(false);
    expect(wouldCreateCycle("ana", "root", cells)).toBe(false);
  });
});

describe("TIER_STYLE", () => {
  // The graph paints these into an SVG `fill`, where a literal colour would look
  // right in whichever theme its author was in and wrong in the other.
  it("resolves every fill through a CSS custom property", () => {
    for (const [tier, style] of Object.entries(TIER_STYLE)) {
      expect(style.fill, tier).toContain("var(--");
      expect(style.fill, tier).not.toContain("#");
    }
  });

  it("sizes nodes by seniority so the hierarchy reads at a glance", () => {
    expect(TIER_STYLE["leader-of-leaders"].r).toBeGreaterThan(
      TIER_STYLE.leader.r,
    );
    expect(TIER_STYLE.leader.r).toBeGreaterThan(TIER_STYLE.member.r);
  });

  it("labels only the tiers sparse enough for the text to be legible", () => {
    expect(TIER_STYLE["leader-of-leaders"].label).toBe(true);
    expect(TIER_STYLE.leader.label).toBe(true);
    expect(TIER_STYLE.member.label).toBe(false);
    expect(TIER_STYLE.unassigned.label).toBe(false);
  });
});

describe("TIER_LEGEND", () => {
  // The legend and the graph read the same table, so a colour cannot drift
  // between the dot in the key and the dot on the canvas.
  it("covers every tier, most senior first", () => {
    expect(TIER_LEGEND.map((t) => t.tier)).toEqual([
      "leader-of-leaders",
      "leader",
      "member",
      "unassigned",
    ]);
  });

  it("carries the same colour the graph paints", () => {
    for (const entry of TIER_LEGEND) {
      expect(entry.color).toBe(TIER_STYLE[entry.tier].fill);
    }
  });
});
