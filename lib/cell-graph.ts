// Pure hierarchy logic for cell groups. No DB or server-only imports so it can
// be unit-tested in isolation and imported by both server and client code.

export type Tier = "leader-of-leaders" | "leader" | "member" | "unassigned";

export interface PersonInput {
  id: string;
  name: string;
  cellGroupId: string | null;
}

export interface CellInput {
  id: string;
  leaderId: string | null;
  parentCellGroupId: string | null;
}

export interface GraphNode {
  id: string;
  name: string;
  tier: Tier;
  cellGroupId: string | null;
  downlineCount: number;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface CellGraph {
  nodes: GraphNode[];
  links: GraphLink[];
  unassignedCount: number;
}

/** The person who disciples `person` (their upline), or null. */
function uplineOf(
  person: PersonInput,
  cellById: Map<string, CellInput>,
): string | null {
  if (!person.cellGroupId) return null;
  const cell = cellById.get(person.cellGroupId);
  if (!cell) return null;
  if (cell.leaderId === person.id) {
    // Leads their own cell → upline is the parent cell's leader.
    if (!cell.parentCellGroupId) return null;
    return cellById.get(cell.parentCellGroupId)?.leaderId ?? null;
  }
  return cell.leaderId ?? null;
}

export function buildCellGraph(
  people: PersonInput[],
  cells: CellInput[],
): CellGraph {
  const cellById = new Map(cells.map((c) => [c.id, c]));

  // Cells that are somebody's parent → their leader is a "leader of leaders".
  const parentCellIds = new Set<string>();
  for (const c of cells) {
    if (c.parentCellGroupId) parentCellIds.add(c.parentCellGroupId);
  }

  // Cells led by each person.
  const ledCellsByLeader = new Map<string, CellInput[]>();
  for (const c of cells) {
    if (!c.leaderId) continue;
    const list = ledCellsByLeader.get(c.leaderId) ?? [];
    list.push(c);
    ledCellsByLeader.set(c.leaderId, list);
  }

  const tierOf = (person: PersonInput): Tier => {
    if (!person.cellGroupId) return "unassigned";
    const led = ledCellsByLeader.get(person.id);
    if (led && led.length > 0) {
      return led.some((c) => parentCellIds.has(c.id))
        ? "leader-of-leaders"
        : "leader";
    }
    return "member";
  };

  const links: GraphLink[] = [];
  const childrenOf = new Map<string, string[]>();
  for (const p of people) {
    const up = uplineOf(p, cellById);
    if (up && up !== p.id) {
      links.push({ source: p.id, target: up });
      const kids = childrenOf.get(up) ?? [];
      kids.push(p.id);
      childrenOf.set(up, kids);
    }
  }

  // Total descendants, DFS with a visited guard against accidental cycles.
  const downlineCount = (rootId: string): number => {
    let total = 0;
    const stack = [...(childrenOf.get(rootId) ?? [])];
    const seen = new Set<string>([rootId]);
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      total++;
      for (const kid of childrenOf.get(id) ?? []) stack.push(kid);
    }
    return total;
  };

  const nodes: GraphNode[] = people.map((p) => ({
    id: p.id,
    name: p.name,
    tier: tierOf(p),
    cellGroupId: p.cellGroupId,
    downlineCount: downlineCount(p.id),
  }));

  return {
    nodes,
    links,
    unassignedCount: people.filter((p) => !p.cellGroupId).length,
  };
}

/**
 * Would setting `cells[cellId].parentCellGroupId = newParentId` create a cycle?
 * Walk up from newParentId; a cycle exists if we reach cellId again.
 */
export function wouldCreateCycle(
  cellId: string,
  newParentId: string | null,
  cells: CellInput[],
): boolean {
  if (!newParentId) return false;
  if (newParentId === cellId) return true;
  const cellById = new Map(cells.map((c) => [c.id, c]));
  let current: string | null = newParentId;
  const seen = new Set<string>();
  while (current) {
    if (current === cellId) return true;
    if (seen.has(current)) break; // pre-existing cycle elsewhere; stop
    seen.add(current);
    current = cellById.get(current)?.parentCellGroupId ?? null;
  }
  return false;
}

/**
 * How each tier is drawn in the cell-group graph — the single source of truth
 * for both the SVG nodes and the legend beside them, so a colour can never
 * drift between the two.
 *
 * Every fill resolves through a CSS custom property rather than a literal
 * colour. That is what lets the graph follow the theme; a hex here would look
 * right in light mode and disappear in dark. `lib/cell-graph.test.ts` enforces
 * it.
 */
export const TIER_STYLE: Record<
  Tier,
  { fill: string; r: number; label: boolean; legend: string }
> = {
  "leader-of-leaders": {
    fill: "var(--color-chart-1)",
    r: 16,
    label: true,
    legend: "Leader of leaders",
  },
  leader: {
    fill: "var(--color-chart-2)",
    r: 11,
    label: true,
    legend: "Leader",
  },
  member: {
    fill: "var(--color-muted-foreground)",
    r: 6,
    label: false,
    legend: "Member",
  },
  // Dimmer than `member` but still visible. `--border` is not usable here: it is
  // a translucent white in dark mode, which vanishes as a filled dot.
  unassigned: {
    fill: "color-mix(in oklch, var(--color-muted-foreground), var(--color-background) 45%)",
    r: 6,
    label: false,
    legend: "Unassigned",
  },
};

/** Tiers in the order the legend lists them, most senior first. */
export const TIER_LEGEND = (
  ["leader-of-leaders", "leader", "member", "unassigned"] as const
).map((tier) => ({
  tier,
  label: TIER_STYLE[tier].legend,
  color: TIER_STYLE[tier].fill,
}));
