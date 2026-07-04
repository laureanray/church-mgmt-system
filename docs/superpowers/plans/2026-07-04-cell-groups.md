# Cell Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cell groups (discipleship cells) with full management, member assignment, and an interactive force-directed graph of the leader-of-leaders → leader → member hierarchy that makes members who belong to no cell impossible to miss.

**Architecture:** A new `cell_groups` table plus two nullable columns on `members` (`cellGroupId`, `userId`). Everyone in the graph is a **member node**; a person's upline is derived (not stored) from their cell's leader and that cell's parent. All hierarchy math lives in one pure module, `lib/cell-graph.ts`, so it is unit-tested without a database. Management UI, member assignment, and the graph page mirror the existing `members` feature patterns.

**Tech Stack:** Next.js 16 (App Router, modified — see Global Constraints), React 19, Drizzle ORM + postgres-js, Base UI (shadcn Base UI variant), Tailwind v4, zod, lucide-react, `d3-force` (new), `vitest` (new, for pure-logic tests only).

## Global Constraints

- **Modified Next.js.** Per `AGENTS.md`, before writing any page/route/server-action code, read the relevant guide under `node_modules/next/dist/docs/01-app/` — specifically `01-getting-started/07-mutating-data.md` and `02-guides/server-actions.md` for actions, `03-api-reference/03-file-conventions/dynamic-routes.md` for `[id]` routes. New code here mirrors existing working files, so this is a verification pass, not a redesign.
- **Base UI variant of shadcn:** components use `render` (not `asChild`); `Select` uses `name`/`items` (wrapped by `components/form/FormSelect`); there is no `form.tsx`. Reuse `components/form/Field` and `components/form/FormSelect`.
- **Server actions pattern:** `"use server"`, `requireRole(["admin","leader"])` for mutations, `requireUser()` for reads, zod validation via `lib/validators.ts`, `revalidatePath`, `redirect`. Copy the shape of `app/(app)/members/actions.ts`.
- **Terminology:** "Cell Group" everywhere in UI copy. Nav label "Cell Groups". Route base `/cell-groups`.
- **Unassigned = `members.cellGroupId IS NULL`.** A cell's leader belongs to the cell they lead (so top leaders are never flagged unassigned).
- **Package manager is pnpm.** Migrations: `pnpm db:generate` then `pnpm db:migrate`. Local dev DB is Docker Postgres on port 5433; `pnpm db:up` starts it.
- **DRY / YAGNI:** No history/audit trail. `members.userId` column is added for the data model but has **no UI** in v1.

---

## File Structure

**New files:**
- `lib/cell-graph.ts` — pure hierarchy logic: `buildCellGraph`, `wouldCreateCycle`, tier/upline/downline. No `server-only`, no `db` imports.
- `lib/cell-graph.test.ts` — vitest unit tests for the above.
- `vitest.config.ts` — minimal vitest config with `@/` alias.
- `app/(app)/cell-groups/actions.ts` — server actions: create/update/delete/assign/promote.
- `app/(app)/cell-groups/page.tsx` — headline page: graph + summary + unassigned panel + list toggle.
- `app/(app)/cell-groups/new/page.tsx` — create form page.
- `app/(app)/cell-groups/[id]/page.tsx` — cell group detail.
- `app/(app)/cell-groups/[id]/edit/page.tsx` — edit form page.
- `components/cell-groups/cell-group-form.tsx` — client form (create/edit).
- `components/cell-groups/cell-graph.tsx` — client d3-force SVG graph.
- `components/cell-groups/unassigned-panel.tsx` — client quick-assign list.
- `components/cell-groups/delete-cell-group-button.tsx` — client delete confirm button.

**Modified files:**
- `db/schema.ts` — `cellGroups` table, `members.cellGroupId`/`userId`, relations, inferred types.
- `db/seed.ts` — sample cell groups + assignments + deliberately-unassigned members.
- `lib/validators.ts` — `cellGroupSchema`, `assignSchema`.
- `lib/constants.ts` — `MEETING_DAY_OPTIONS` helper (derived from existing `DAYS_OF_WEEK`).
- `lib/format.ts` — `formatMeeting(day, time, location)` helper (read the file first; add alongside existing helpers).
- `components/app-sidebar.tsx` — "Cell Groups" nav item.
- `components/members/member-form.tsx` — cell-group `FormSelect`.
- `app/(app)/members/actions.ts` — include `cellGroupId` in create/update.
- `app/(app)/members/new/page.tsx`, `app/(app)/members/[id]/edit/page.tsx` — fetch cell options, pass to `MemberForm`.
- `app/(app)/members/[id]/page.tsx` — show the member's cell group + "Promote to leader".
- `package.json` — add `d3-force`, `@types/d3-force`, `vitest`; add `"test"` script.

**Canonical interfaces (defined in `lib/cell-graph.ts`, Task 2 — used by later tasks):**
```ts
export type Tier = "leader-of-leaders" | "leader" | "member" | "unassigned";
export interface PersonInput { id: string; name: string; cellGroupId: string | null; }
export interface CellInput { id: string; leaderId: string | null; parentCellGroupId: string | null; }
export interface GraphNode { id: string; name: string; tier: Tier; cellGroupId: string | null; downlineCount: number; }
export interface GraphLink { source: string; target: string; }
export interface CellGraph { nodes: GraphNode[]; links: GraphLink[]; unassignedCount: number; }
export function buildCellGraph(people: PersonInput[], cells: CellInput[]): CellGraph;
export function wouldCreateCycle(cellId: string, newParentId: string | null, cells: CellInput[]): boolean;
```

---

## Task 1: Schema — `cell_groups` table + member columns + migration

**Files:**
- Modify: `db/schema.ts`
- Generate: `db/migrations/*` (auto-numbered by drizzle-kit)

**Interfaces:**
- Produces: `cellGroups` table export; `members.cellGroupId`, `members.userId`; relations `cellGroupsRelations`, extended `membersRelations`; types `CellGroup`, `NewCellGroup`.

- [ ] **Step 1: Add the `cellGroups` table.** In `db/schema.ts`, add `AnyPgColumn` to the `drizzle-orm/pg-core` import, then insert this block after the `members` table (before `serviceSchedules`):

```ts
// ---------------------------------------------------------------------------
// Cell groups — discipleship cells. A cell has a leader (a member) and may sit
// under a parent cell, forming the leader-of-leaders network.
// ---------------------------------------------------------------------------

export const cellGroups = pgTable("cell_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // The member who leads this cell. Nullable so a cell can briefly be leaderless.
  leaderId: uuid("leader_id").references(() => members.id, {
    onDelete: "set null",
  }),
  // The upline cell. This nesting produces "leaders of leaders".
  parentCellGroupId: uuid("parent_cell_group_id").references(
    (): AnyPgColumn => cellGroups.id,
    { onDelete: "set null" },
  ),
  meetingDay: integer("meeting_day"), // 0 = Sunday .. 6 = Saturday
  meetingTime: text("meeting_time"), // "HH:mm" 24h
  meetingLocation: text("meeting_location"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

- [ ] **Step 2: Add the two columns to `members`.** Inside the `members` `pgTable({...})` object, after the `occupation` line, add:

```ts
  // The cell group this person belongs to. NULL = not yet in any cell group.
  cellGroupId: uuid("cell_group_id").references((): AnyPgColumn => cellGroups.id, {
    onDelete: "set null",
  }),
  // Links a member to their staff login, when they also log in. No UI in v1.
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "set null" })
    .unique(),
```

(Note: `members` references `cellGroups` and `cellGroups` references `members` — both use the `(): AnyPgColumn =>` lazy form, which is why the type import is required.)

- [ ] **Step 3: Add/extend relations.** Replace the existing `membersRelations` and add `cellGroupsRelations`:

```ts
export const membersRelations = relations(members, ({ one, many }) => ({
  attendance: many(attendance),
  cellGroup: one(cellGroups, {
    fields: [members.cellGroupId],
    references: [cellGroups.id],
  }),
  user: one(users, {
    fields: [members.userId],
    references: [users.id],
  }),
  ledCellGroups: many(cellGroups, { relationName: "cellLeader" }),
}));

export const cellGroupsRelations = relations(cellGroups, ({ one, many }) => ({
  leader: one(members, {
    fields: [cellGroups.leaderId],
    references: [members.id],
    relationName: "cellLeader",
  }),
  parent: one(cellGroups, {
    fields: [cellGroups.parentCellGroupId],
    references: [cellGroups.id],
    relationName: "cellParent",
  }),
  children: many(cellGroups, { relationName: "cellParent" }),
  members: many(members),
}));
```

- [ ] **Step 4: Add inferred types.** In the "Inferred types" block:

```ts
export type CellGroup = typeof cellGroups.$inferSelect;
export type NewCellGroup = typeof cellGroups.$inferInsert;
```

- [ ] **Step 5: Generate the migration.**

Run: `pnpm db:generate`
Expected: prints a new migration tag (e.g. `000N_*`) and writes a `.sql` file under `db/migrations/` creating `cell_groups` and altering `members`. No "No schema changes" message.

- [ ] **Step 6: Apply the migration.** Ensure the DB is up (`pnpm db:up`), then:

Run: `pnpm db:migrate`
Expected: applies the new migration with no error.

- [ ] **Step 7: Smoke-test the new table.** Verify the table exists and is queryable:

Run:
```bash
pnpm tsx -e "import('./db/index.ts').then(async ({db}) => { const { cellGroups } = await import('./db/schema.ts'); console.log('cell_groups rows:', await db.select().from(cellGroups)); process.exit(0); })"
```
Expected: `cell_groups rows: []` (no error → table exists, columns valid).

- [ ] **Step 8: Commit.**

```bash
git add db/schema.ts db/migrations
git commit -m "feat(cell-groups): add cell_groups table and member links"
```

---

## Task 2: Pure hierarchy logic + vitest

**Files:**
- Create: `lib/cell-graph.ts`
- Create: `lib/cell-graph.test.ts`
- Create: `vitest.config.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: the canonical interfaces + `buildCellGraph`, `wouldCreateCycle` (see File Structure).

- [ ] **Step 1: Install vitest + wire the test script.**

```bash
pnpm add -D vitest
```
Then add to `package.json` `"scripts"` (after `"lint"`): `"test": "vitest run",`

- [ ] **Step 2: Create `vitest.config.ts`.**

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Write the failing tests.** Create `lib/cell-graph.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildCellGraph, wouldCreateCycle } from "./cell-graph";

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
```

- [ ] **Step 4: Run the tests to confirm they fail.**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./cell-graph` / functions not defined.

- [ ] **Step 5: Implement `lib/cell-graph.ts`.**

```ts
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
```

- [ ] **Step 6: Run the tests to confirm they pass.**

Run: `pnpm test`
Expected: PASS — all cases green.

- [ ] **Step 7: Commit.**

```bash
git add lib/cell-graph.ts lib/cell-graph.test.ts vitest.config.ts package.json pnpm-lock.yaml
git commit -m "feat(cell-groups): pure hierarchy logic with vitest tests"
```

---

## Task 3: Validators + constants

**Files:**
- Modify: `lib/validators.ts`
- Modify: `lib/constants.ts`
- Modify: `lib/cell-graph.test.ts` (add schema tests — keep them in vitest)

**Interfaces:**
- Produces: `cellGroupSchema`, `CellGroupInput`, `assignSchema` in `lib/validators.ts`; `MEETING_DAY_OPTIONS` in `lib/constants.ts`.

- [ ] **Step 1: Add `MEETING_DAY_OPTIONS` to `lib/constants.ts`.** After the `DAYS_OF_WEEK` block:

```ts
// Options for a meeting-day <Select> (value is the JS day index as a string).
export const MEETING_DAY_OPTIONS = DAYS_OF_WEEK.map((label, i) => ({
  value: String(i),
  label,
}));
```

- [ ] **Step 2: Write failing validator tests.** Create `lib/validators.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cellGroupSchema } from "./validators";

describe("cellGroupSchema", () => {
  it("requires a name", () => {
    expect(cellGroupSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("accepts a minimal valid cell group and defaults active to true", () => {
    const r = cellGroupSchema.safeParse({ name: "Ana's Cell" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.active).toBe(true);
      expect(r.data.leaderId).toBeNull();
      expect(r.data.parentCellGroupId).toBeNull();
      expect(r.data.meetingDay).toBeNull();
    }
  });

  it("coerces empty optional fields to null and parses meeting fields", () => {
    const r = cellGroupSchema.safeParse({
      name: "Youth",
      leaderId: "",
      meetingDay: "3",
      meetingTime: "19:00",
      meetingLocation: "Room 2",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.meetingDay).toBe(3);
      expect(r.data.meetingTime).toBe("19:00");
      expect(r.data.leaderId).toBeNull();
    }
  });

  it("rejects a bad meeting time", () => {
    const r = cellGroupSchema.safeParse({ name: "X", meetingTime: "7pm" });
    expect(r.success).toBe(false);
  });
});
```

Run: `pnpm test`
Expected: FAIL — `cellGroupSchema` not exported.

- [ ] **Step 3: Add the schemas to `lib/validators.ts`.** Append (the file already defines `emptyToNull` and `optionalText` at the top — reuse them):

```ts
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const optionalUuid = z.preprocess(
  emptyToNull,
  z.string().regex(UUID_RE, "Invalid selection").nullable(),
);

export const cellGroupSchema = z.object({
  name: z.string().trim().min(1, "Cell group name is required").max(200),
  leaderId: optionalUuid,
  parentCellGroupId: optionalUuid,
  meetingDay: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number().int().min(0).max(6).nullable(),
  ),
  meetingTime: z.preprocess(
    emptyToNull,
    z.string().regex(/^\d{2}:\d{2}$/, "Pick a valid time").nullable(),
  ),
  meetingLocation: optionalText,
  notes: optionalText,
  active: z.preprocess(
    (v) =>
      v === undefined || v === null
        ? true
        : v === "on" || v === "true" || v === true,
    z.boolean(),
  ),
});

export type CellGroupInput = z.infer<typeof cellGroupSchema>;

// Quick-assign a member to a cell group (or clear it with an empty value).
export const assignSchema = z.object({
  memberId: z.string().regex(UUID_RE, "Invalid member"),
  cellGroupId: optionalUuid,
});
```

- [ ] **Step 4: Run tests to confirm they pass.**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add lib/validators.ts lib/validators.test.ts lib/constants.ts
git commit -m "feat(cell-groups): add cell group validators and meeting-day options"
```

---

## Task 4: Server actions

**Files:**
- Create: `app/(app)/cell-groups/actions.ts`

**Interfaces:**
- Consumes: `cellGroupSchema`, `assignSchema` (Task 3); `wouldCreateCycle` (Task 2); `cellGroups`, `members` (Task 1).
- Produces: `CellGroupFormState`; `createCellGroup(prev, formData)`, `updateCellGroup(id, prev, formData)`, `deleteCellGroup(id)`, `assignMemberToCellGroup(formData)`, `promoteMemberToLeader(formData)`.

- [ ] **Step 1: Consult the docs.** Read `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` and `02-guides/server-actions.md` (per Global Constraints). Confirm the `"use server"` + `revalidatePath` + `redirect` shape used in `app/(app)/members/actions.ts` still matches.

- [ ] **Step 2: Create `app/(app)/cell-groups/actions.ts`.**

```ts
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { cellGroups, members } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { wouldCreateCycle } from "@/lib/cell-graph";
import { assignSchema, cellGroupSchema, fieldErrors } from "@/lib/validators";

export type CellGroupFormState =
  | { errors?: Record<string, string>; message?: string }
  | undefined;

function readForm(formData: FormData) {
  return cellGroupSchema.safeParse({
    name: formData.get("name"),
    leaderId: formData.get("leaderId"),
    parentCellGroupId: formData.get("parentCellGroupId"),
    meetingDay: formData.get("meetingDay"),
    meetingTime: formData.get("meetingTime"),
    meetingLocation: formData.get("meetingLocation"),
    notes: formData.get("notes"),
    active: formData.get("active"),
  });
}

export async function createCellGroup(
  _prev: CellGroupFormState,
  formData: FormData,
): Promise<CellGroupFormState> {
  await requireRole(["admin", "leader"]);

  const parsed = readForm(formData);
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  const [row] = await db
    .insert(cellGroups)
    .values(parsed.data)
    .returning({ id: cellGroups.id });

  // Keep the leader inside the cell they lead so they are never "unassigned".
  if (parsed.data.leaderId) {
    await db
      .update(members)
      .set({ cellGroupId: row.id, updatedAt: new Date() })
      .where(eq(members.id, parsed.data.leaderId));
  }

  revalidatePath("/cell-groups");
  revalidatePath("/members");
  redirect(`/cell-groups/${row.id}`);
}

export async function updateCellGroup(
  id: string,
  _prev: CellGroupFormState,
  formData: FormData,
): Promise<CellGroupFormState> {
  await requireRole(["admin", "leader"]);

  const parsed = readForm(formData);
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  // Reject a parent choice that would create a cycle.
  if (parsed.data.parentCellGroupId) {
    const all = await db
      .select({
        id: cellGroups.id,
        leaderId: cellGroups.leaderId,
        parentCellGroupId: cellGroups.parentCellGroupId,
      })
      .from(cellGroups);
    if (wouldCreateCycle(id, parsed.data.parentCellGroupId, all)) {
      return {
        errors: {
          parentCellGroupId: "That would make the cell its own ancestor.",
        },
        message: "Please pick a different parent cell group.",
      };
    }
  }

  await db
    .update(cellGroups)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(cellGroups.id, id));

  if (parsed.data.leaderId) {
    await db
      .update(members)
      .set({ cellGroupId: id, updatedAt: new Date() })
      .where(eq(members.id, parsed.data.leaderId));
  }

  revalidatePath("/cell-groups");
  revalidatePath(`/cell-groups/${id}`);
  revalidatePath("/members");
  redirect(`/cell-groups/${id}`);
}

export async function deleteCellGroup(id: string) {
  await requireRole(["admin", "leader"]);
  // onDelete: set null handles members (become unassigned) and child cells
  // (become roots) automatically.
  await db.delete(cellGroups).where(eq(cellGroups.id, id));
  revalidatePath("/cell-groups");
  revalidatePath("/members");
  redirect("/cell-groups");
}

export async function assignMemberToCellGroup(formData: FormData) {
  await requireRole(["admin", "leader"]);
  const parsed = assignSchema.safeParse({
    memberId: formData.get("memberId"),
    cellGroupId: formData.get("cellGroupId"),
  });
  if (!parsed.success) return;

  await db
    .update(members)
    .set({ cellGroupId: parsed.data.cellGroupId, updatedAt: new Date() })
    .where(eq(members.id, parsed.data.memberId));

  revalidatePath("/cell-groups");
  revalidatePath(`/members/${parsed.data.memberId}`);
}

export async function promoteMemberToLeader(formData: FormData) {
  await requireRole(["admin", "leader"]);

  const memberId = String(formData.get("memberId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const parentRaw = String(formData.get("parentCellGroupId") ?? "").trim();
  const parentCellGroupId = parentRaw === "" ? null : parentRaw;
  if (!memberId || !name) return;

  const [row] = await db
    .insert(cellGroups)
    .values({ name, leaderId: memberId, parentCellGroupId })
    .returning({ id: cellGroups.id });

  // The new leader now belongs to the cell they lead.
  await db
    .update(members)
    .set({ cellGroupId: row.id, updatedAt: new Date() })
    .where(eq(members.id, memberId));

  revalidatePath("/cell-groups");
  revalidatePath(`/members/${memberId}`);
  redirect(`/cell-groups/${row.id}`);
}
```

- [ ] **Step 3: Type-check compiles.** (No standalone test — DB side effects are verified through the UI in Task 8's manual pass and the smoke test below.)

Run: `pnpm exec tsc --noEmit`
Expected: no errors from `app/(app)/cell-groups/actions.ts`.

- [ ] **Step 4: Smoke-test create + assign + cycle-guard against the real DB.** (Ad-hoc script; delete after.)

Run:
```bash
pnpm tsx -e "
import('./db/index.ts').then(async ({db}) => {
  const { cellGroups, members } = await import('./db/schema.ts');
  const { wouldCreateCycle } = await import('./lib/cell-graph.ts');
  const [c] = await db.insert(cellGroups).values({ name: 'SMOKE TEST CELL' }).returning();
  console.log('created cell:', c.id, 'active=', c.active);
  const rows = await db.select({id:cellGroups.id, leaderId:cellGroups.leaderId, parentCellGroupId:cellGroups.parentCellGroupId}).from(cellGroups);
  console.log('cycle self-parent:', wouldCreateCycle(c.id, c.id, rows));
  await db.delete(cellGroups).where((await import('drizzle-orm')).eq(cellGroups.id, c.id));
  console.log('cleaned up'); process.exit(0);
});
"
```
Expected: prints `active= true`, `cycle self-parent: true`, `cleaned up`, no errors.

- [ ] **Step 5: Commit.**

```bash
git add app/(app)/cell-groups/actions.ts
git commit -m "feat(cell-groups): server actions for CRUD, assign, promote"
```

---

## Task 5: Cell group management UI (form + pages)

**Files:**
- Create: `components/cell-groups/cell-group-form.tsx`
- Create: `components/cell-groups/delete-cell-group-button.tsx`
- Create: `app/(app)/cell-groups/new/page.tsx`
- Create: `app/(app)/cell-groups/[id]/page.tsx`
- Create: `app/(app)/cell-groups/[id]/edit/page.tsx`
- Modify: `lib/format.ts` (add `formatMeeting`)

**Interfaces:**
- Consumes: actions from Task 4; `FormSelect`, `Field`, `PageHeader`, `Card`, `Button`, `Input`, `Textarea` (existing); `MEETING_DAY_OPTIONS` (Task 3).
- Produces: `CellGroupForm`, `DeleteCellGroupButton`, the three routes.

- [ ] **Step 1: Add `formatMeeting` to `lib/format.ts`.** Read the file first to match its export style, then add:

```ts
import { DAYS_OF_WEEK } from "@/lib/constants";

/** "Wed · 7:00 PM · Room 2" from parts; omits missing pieces; "—" if empty. */
export function formatMeeting(
  day: number | null,
  time: string | null,
  location: string | null,
): string {
  const parts: string[] = [];
  if (day != null && day >= 0 && day <= 6) parts.push(DAYS_OF_WEEK[day].slice(0, 3));
  if (time) {
    const [h, m] = time.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = ((h + 11) % 12) + 1;
    parts.push(`${hour12}:${String(m).padStart(2, "0")} ${period}`);
  }
  if (location) parts.push(location);
  return parts.length ? parts.join(" · ") : "—";
}
```
(If `lib/format.ts` already imports from `@/lib/constants`, merge the import rather than duplicating it.)

- [ ] **Step 2: Create `components/cell-groups/cell-group-form.tsx`.**

```tsx
"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2, Save } from "lucide-react";

import type { CellGroupFormState } from "@/app/(app)/cell-groups/actions";
import { Field } from "@/components/form/field";
import { FormSelect, type SelectOption } from "@/components/form/form-select";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MEETING_DAY_OPTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { CellGroup } from "@/db/schema";

type CellGroupAction = (
  state: CellGroupFormState,
  formData: FormData,
) => Promise<CellGroupFormState>;

export function CellGroupForm({
  action,
  cellGroup,
  memberOptions,
  cellOptions,
  submitLabel = "Save cell group",
}: {
  action: CellGroupAction;
  cellGroup?: CellGroup;
  memberOptions: SelectOption[];
  cellOptions: SelectOption[];
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState<
    CellGroupFormState,
    FormData
  >(action, undefined);
  const errors = state?.errors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      {state?.message ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.message}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cell Group</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Name"
            htmlFor="name"
            required
            error={errors.name}
            className="sm:col-span-2"
          >
            <Input
              id="name"
              name="name"
              defaultValue={cellGroup?.name ?? ""}
              placeholder="e.g. Ana's Cell"
              required
            />
          </Field>

          <Field label="Leader" htmlFor="leaderId" error={errors.leaderId}>
            <FormSelect
              id="leaderId"
              name="leaderId"
              placeholder="Select a leader"
              options={memberOptions}
              defaultValue={cellGroup?.leaderId}
            />
          </Field>

          <Field
            label="Upline (parent cell group)"
            htmlFor="parentCellGroupId"
            hint="Whose network this cell sits under"
            error={errors.parentCellGroupId}
          >
            <FormSelect
              id="parentCellGroupId"
              name="parentCellGroupId"
              placeholder="None (top level)"
              options={cellOptions}
              defaultValue={cellGroup?.parentCellGroupId}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Meeting</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Day" htmlFor="meetingDay" error={errors.meetingDay}>
            <FormSelect
              id="meetingDay"
              name="meetingDay"
              placeholder="Select a day"
              options={MEETING_DAY_OPTIONS}
              defaultValue={
                cellGroup?.meetingDay != null
                  ? String(cellGroup.meetingDay)
                  : undefined
              }
            />
          </Field>

          <Field label="Time" htmlFor="meetingTime" error={errors.meetingTime}>
            <Input
              id="meetingTime"
              name="meetingTime"
              type="time"
              defaultValue={cellGroup?.meetingTime ?? ""}
            />
          </Field>

          <Field
            label="Location"
            htmlFor="meetingLocation"
            error={errors.meetingLocation}
            className="sm:col-span-2"
          >
            <Input
              id="meetingLocation"
              name="meetingLocation"
              defaultValue={cellGroup?.meetingLocation ?? ""}
              placeholder="e.g. Room 2 / a member's home"
            />
          </Field>

          <Field
            label="Notes"
            htmlFor="notes"
            error={errors.notes}
            className="sm:col-span-2"
          >
            <Textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={cellGroup?.notes ?? ""}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Link
          href={cellGroup ? `/cell-groups/${cellGroup.id}` : "/cell-groups"}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Cancel
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Create `components/cell-groups/delete-cell-group-button.tsx`.** Model it on the existing `components/members/delete-member-button.tsx` — read that file and copy its structure, swapping the action. Implementation:

```tsx
"use client";

import { Trash2 } from "lucide-react";

import { deleteCellGroup } from "@/app/(app)/cell-groups/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function DeleteCellGroupButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Trash2 className="size-4" />
            Delete
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{name}”?</DialogTitle>
          <DialogDescription>
            Members in this cell group become unassigned and any child cell
            groups become top-level. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <form action={deleteCellGroup.bind(null, id)}>
            <Button type="submit" variant="destructive">
              Delete cell group
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```
(Verify the `Dialog`/`DialogClose` render-prop API against `components/ui/dialog.tsx` and the existing `delete-member-button.tsx`; adjust prop names if that file differs.)

- [ ] **Step 4: Create `app/(app)/cell-groups/new/page.tsx`.**

```tsx
import Link from "next/link";
import { asc } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";

import { createCellGroup } from "../actions";
import { db } from "@/db";
import { cellGroups, members } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { CellGroupForm } from "@/components/cell-groups/cell-group-form";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function NewCellGroupPage() {
  await requireRole(["admin", "leader"]);

  const [memberRows, cellRows] = await Promise.all([
    db
      .select({ id: members.id, name: members.fullName })
      .from(members)
      .orderBy(asc(members.fullName)),
    db
      .select({ id: cellGroups.id, name: cellGroups.name })
      .from(cellGroups)
      .orderBy(asc(cellGroups.name)),
  ]);

  const memberOptions = memberRows.map((m) => ({ value: m.id, label: m.name }));
  const cellOptions = cellRows.map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/cell-groups"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "mb-2 -ml-2",
        )}
      >
        <ArrowLeft className="size-4" />
        Back to cell groups
      </Link>
      <PageHeader
        title="New Cell Group"
        description="Create a cell group and assign its leader."
      />
      <CellGroupForm
        action={createCellGroup}
        memberOptions={memberOptions}
        cellOptions={cellOptions}
        submitLabel="Create cell group"
      />
    </div>
  );
}
```

- [ ] **Step 5: Create `app/(app)/cell-groups/[id]/edit/page.tsx`.**

```tsx
import Link from "next/link";
import { and, asc, eq, ne } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { updateCellGroup } from "../../actions";
import { db } from "@/db";
import { cellGroups, members } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { CellGroupForm } from "@/components/cell-groups/cell-group-form";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function EditCellGroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["admin", "leader"]);
  const { id } = await params;

  const cellGroup = await db.query.cellGroups.findFirst({
    where: eq(cellGroups.id, id),
  });
  if (!cellGroup) notFound();

  const [memberRows, cellRows] = await Promise.all([
    db
      .select({ id: members.id, name: members.fullName })
      .from(members)
      .orderBy(asc(members.fullName)),
    db
      .select({ id: cellGroups.id, name: cellGroups.name })
      .from(cellGroups)
      .where(ne(cellGroups.id, id)) // can't be its own parent
      .orderBy(asc(cellGroups.name)),
  ]);

  const memberOptions = memberRows.map((m) => ({ value: m.id, label: m.name }));
  const cellOptions = cellRows.map((c) => ({ value: c.id, label: c.name }));
  const action = updateCellGroup.bind(null, cellGroup.id);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/cell-groups/${cellGroup.id}`}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "mb-2 -ml-2",
        )}
      >
        <ArrowLeft className="size-4" />
        Back to cell group
      </Link>
      <PageHeader title="Edit Cell Group" description={`Update ${cellGroup.name}.`} />
      <CellGroupForm
        action={action}
        cellGroup={cellGroup}
        memberOptions={memberOptions}
        cellOptions={cellOptions}
        submitLabel="Save changes"
      />
    </div>
  );
}
```
(The unused `and` import can be dropped; keep imports that ESLint accepts.)

- [ ] **Step 6: Create `app/(app)/cell-groups/[id]/page.tsx` (detail).**

```tsx
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Users } from "lucide-react";

import { db } from "@/db";
import { cellGroups, members } from "@/db/schema";
import { canManage, requireUser } from "@/lib/auth-helpers";
import { formatMeeting } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DeleteCellGroupButton } from "@/components/cell-groups/delete-cell-group-button";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function CellGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const cellGroup = await db.query.cellGroups.findFirst({
    where: eq(cellGroups.id, id),
    with: { leader: true, parent: true, children: true },
  });
  if (!cellGroup) notFound();

  const roster = await db
    .select({ id: members.id, name: members.fullName })
    .from(members)
    .where(eq(members.cellGroupId, id))
    .orderBy(asc(members.fullName));

  const manage = canManage(user.role);

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/cell-groups"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "mb-2 -ml-2",
        )}
      >
        <ArrowLeft className="size-4" />
        Back to cell groups
      </Link>

      <PageHeader
        title={cellGroup.name}
        description={formatMeeting(
          cellGroup.meetingDay,
          cellGroup.meetingTime,
          cellGroup.meetingLocation,
        )}
      >
        {manage ? (
          <>
            <Link
              href={`/cell-groups/${cellGroup.id}/edit`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <Pencil className="size-4" />
              Edit
            </Link>
            <DeleteCellGroupButton id={cellGroup.id} name={cellGroup.name} />
          </>
        ) : null}
      </PageHeader>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leadership</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Leader:{" "}
              {cellGroup.leader ? (
                <Link
                  href={`/members/${cellGroup.leader.id}`}
                  className="font-medium hover:underline"
                >
                  {cellGroup.leader.fullName}
                </Link>
              ) : (
                <Badge variant="outline">No leader</Badge>
              )}
            </p>
            <p>
              Upline:{" "}
              {cellGroup.parent ? (
                <Link
                  href={`/cell-groups/${cellGroup.parent.id}`}
                  className="font-medium hover:underline"
                >
                  {cellGroup.parent.name}
                </Link>
              ) : (
                <span className="text-muted-foreground">Top level</span>
              )}
            </p>
            {cellGroup.children.length > 0 ? (
              <p className="text-muted-foreground">
                {cellGroup.children.length} child cell
                {cellGroup.children.length === 1 ? "" : "s"}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4" />
              Members ({roster.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {roster.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {roster.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/members/${m.id}`}
                      className="hover:underline"
                    >
                      {m.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Verify it compiles and renders.**

Run: `pnpm build`
Expected: build succeeds; the `/cell-groups/[id]`, `/cell-groups/new`, `/cell-groups/[id]/edit` routes appear with no type errors.

- [ ] **Step 8: Commit.**

```bash
git add lib/format.ts components/cell-groups app/(app)/cell-groups/new app/(app)/cell-groups/[id]
git commit -m "feat(cell-groups): management form, detail, edit, delete UI"
```

---

## Task 6: Member assignment integration

**Files:**
- Modify: `lib/validators.ts` (add `cellGroupId` to `memberSchema`)
- Modify: `app/(app)/members/actions.ts`
- Modify: `components/members/member-form.tsx`
- Modify: `app/(app)/members/new/page.tsx`
- Modify: `app/(app)/members/[id]/edit/page.tsx`
- Modify: `app/(app)/members/[id]/page.tsx`

**Interfaces:**
- Consumes: `assignMemberToCellGroup`, `promoteMemberToLeader` (Task 4); `FormSelect` (existing).
- Produces: member records carry `cellGroupId`; member detail shows cell group + promote control.

- [ ] **Step 1: Add `cellGroupId` to `memberSchema`.** In `lib/validators.ts`, inside `memberSchema` (after `occupation`), add:

```ts
  cellGroupId: optionalUuid,
```
(`optionalUuid` was added in Task 3 — it is in the same file.)

- [ ] **Step 2: Read `cellGroupId` in member actions.** In `app/(app)/members/actions.ts`, add to the object inside `readMemberForm`:

```ts
    cellGroupId: formData.get("cellGroupId"),
```
No other change needed — `createMember`/`updateMember` already spread `parsed.data`.

- [ ] **Step 3: Add the cell-group select to `MemberForm`.** In `components/members/member-form.tsx`:
  - Add a prop: change the signature to include `cellOptions: SelectOption[]` and import the type: `import { FormSelect, type SelectOption } from "@/components/form/form-select";` (adjust the existing `FormSelect` import).
  - Add a "Church Involvement" card (or append to the Personal card) with:

```tsx
          <Field
            label="Cell Group"
            htmlFor="cellGroupId"
            hint="Leave blank if not yet in a cell group"
            error={errors.cellGroupId}
          >
            <FormSelect
              id="cellGroupId"
              name="cellGroupId"
              placeholder="Not in a cell group"
              options={cellOptions}
              defaultValue={member?.cellGroupId}
            />
          </Field>
```

- [ ] **Step 4: Pass `cellOptions` from the member pages.** In both `app/(app)/members/new/page.tsx` and `app/(app)/members/[id]/edit/page.tsx`:
  - Add imports: `import { asc } from "drizzle-orm";` (edit page already imports `eq`) and `import { cellGroups } from "@/db/schema";`.
  - Fetch options before the return:

```ts
  const cellRows = await db
    .select({ id: cellGroups.id, name: cellGroups.name })
    .from(cellGroups)
    .orderBy(asc(cellGroups.name));
  const cellOptions = cellRows.map((c) => ({ value: c.id, label: c.name }));
```
  (The new-member page must import `db` too: `import { db } from "@/db";`.)
  - Pass `cellOptions={cellOptions}` to `<MemberForm />`.

- [ ] **Step 5: Show cell group + promote control on member detail.** In `app/(app)/members/[id]/page.tsx`:
  - Change the member query to include the relation:

```ts
  const member = await db.query.members.findFirst({
    where: eq(members.id, id),
    with: { cellGroup: true },
  });
```
  - Add a `DetailRow` in the "Member Details" `<dl>` (e.g. after "Occupation"):

```tsx
                <DetailRow
                  label="Cell Group"
                  value={
                    member.cellGroup ? (
                      <Link
                        href={`/cell-groups/${member.cellGroup.id}`}
                        className="hover:underline"
                      >
                        {member.cellGroup.name}
                      </Link>
                    ) : (
                      <Badge variant="outline">Not in a cell group</Badge>
                    )
                  }
                />
```
  - Add a promote control (only when they manage). Fetch top-level cells for the optional parent select and render a compact form. Add near the top of the component (after `manage`):

```ts
  const parentCells = manage
    ? await db
        .select({ id: cellGroups.id, name: cellGroups.name })
        .from(cellGroups)
        .orderBy(asc(cellGroups.name))
    : [];
```
  and add imports `import { asc } from "drizzle-orm";` and `import { cellGroups } from "@/db/schema";` and `import { promoteMemberToLeader } from "@/app/(app)/cell-groups/actions";`. Then render this card in the right column under the QR card:

```tsx
        {manage ? (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Promote to Leader</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={promoteMemberToLeader} className="space-y-3">
                <input type="hidden" name="memberId" value={member.id} />
                <input
                  name="name"
                  required
                  placeholder="New cell group name"
                  defaultValue={`${member.fullName}'s Cell`}
                  className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
                <select
                  name="parentCellGroupId"
                  className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none"
                  defaultValue=""
                >
                  <option value="">Upline: top level</option>
                  {parentCells.map((c) => (
                    <option key={c.id} value={c.id}>
                      Upline: {c.name}
                    </option>
                  ))}
                </select>
                <Button type="submit" size="sm" variant="outline">
                  Create cell &amp; make leader
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}
```
  (Use a native `<input>`/`<select>` here to keep the promote form simple; it lives outside the QR card grid — place it after the closing `</div>` of the `grid` that holds Details+QR, or inside the right column. Import `Button` from `@/components/ui/button`.)

- [ ] **Step 6: Verify build + a round-trip.**

Run: `pnpm build`
Expected: succeeds, no type errors.

Then manually (dev server, `pnpm dev`): create a cell group, edit a member and set their Cell Group, confirm the member detail shows it and links to the cell whose roster now lists them.

- [ ] **Step 7: Commit.**

```bash
git add lib/validators.ts "app/(app)/members" components/members/member-form.tsx
git commit -m "feat(cell-groups): assign members to cell groups + promote to leader"
```

---

## Task 7: The graph page (server) + interactive graph + unassigned panel

**Files:**
- Create: `components/cell-groups/cell-graph.tsx`
- Create: `components/cell-groups/unassigned-panel.tsx`
- Create: `app/(app)/cell-groups/page.tsx`
- Modify: `components/app-sidebar.tsx`
- Modify: `package.json` (add `d3-force`)

**Interfaces:**
- Consumes: `buildCellGraph`, `GraphNode`, `GraphLink` (Task 2); `assignMemberToCellGroup` (Task 4).
- Produces: the `/cell-groups` headline page and nav entry.

- [ ] **Step 1: Install d3-force.**

```bash
pnpm add d3-force
pnpm add -D @types/d3-force
```

- [ ] **Step 2: Create the graph client component `components/cell-groups/cell-graph.tsx`.**

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
} from "d3-force";

import type { GraphLink, GraphNode } from "@/lib/cell-graph";

type SimNode = GraphNode & {
  x: number;
  y: number;
  fx?: number | null;
  fy?: number | null;
};

const TIER_STYLE: Record<
  GraphNode["tier"],
  { fill: string; r: number; label: boolean }
> = {
  "leader-of-leaders": { fill: "var(--color-primary)", r: 16, label: true },
  leader: { fill: "var(--color-chart-2, #10b981)", r: 11, label: true },
  member: { fill: "var(--color-muted-foreground)", r: 6, label: false },
  unassigned: { fill: "#9ca3af", r: 6, label: false },
};

const WIDTH = 900;
const HEIGHT = 600;

export function CellGraph({
  nodes: input,
  links: inputLinks,
  onSelect,
  selectedId,
}: {
  nodes: GraphNode[];
  links: GraphLink[];
  onSelect: (id: string | null) => void;
  selectedId: string | null;
}) {
  // Only connected people belong on the network canvas (unassigned show in the panel).
  const connected = useMemo(
    () => input.filter((n) => n.tier !== "unassigned"),
    [input],
  );

  const nodesRef = useRef<SimNode[]>([]);
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const [, force] = useState(0); // re-render on tick
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const drag = useRef<{ id: string } | null>(null);

  // Build sim nodes once per data identity.
  useEffect(() => {
    const nodeById = new Map(nodesRef.current.map((n) => [n.id, n]));
    nodesRef.current = connected.map((n, i) => {
      const prev = nodeById.get(n.id);
      return {
        ...n,
        x: prev?.x ?? WIDTH / 2 + Math.cos(i) * 120,
        y: prev?.y ?? HEIGHT / 2 + Math.sin(i) * 120,
      };
    });

    const idset = new Set(connected.map((n) => n.id));
    const links = inputLinks
      .filter((l) => idset.has(l.source) && idset.has(l.target))
      .map((l) => ({ ...l }));

    const sim = forceSimulation<SimNode>(nodesRef.current)
      .force(
        "link",
        forceLink<SimNode, (typeof links)[number]>(links)
          .id((d) => d.id)
          .distance(70)
          .strength(0.6),
      )
      .force("charge", forceManyBody().strength(-260))
      .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
      .force("collide", forceCollide<SimNode>((d) => TIER_STYLE[d.tier].r + 6))
      .on("tick", () => force((t) => t + 1));

    simRef.current = sim;
    return () => {
      sim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, inputLinks]);

  // Highlight the selected node's ancestors + descendants; dim the rest.
  const highlighted = useMemo(() => {
    if (!selectedId) return null;
    const parentOf = new Map(inputLinks.map((l) => [l.source, l.target]));
    const childrenOf = new Map<string, string[]>();
    for (const l of inputLinks) {
      const arr = childrenOf.get(l.target) ?? [];
      arr.push(l.source);
      childrenOf.set(l.target, arr);
    }
    const set = new Set<string>([selectedId]);
    let up: string | undefined = parentOf.get(selectedId);
    while (up && !set.has(up)) {
      set.add(up);
      up = parentOf.get(up);
    }
    const stack = [selectedId];
    while (stack.length) {
      const id = stack.pop()!;
      for (const kid of childrenOf.get(id) ?? []) {
        if (!set.has(kid)) {
          set.add(kid);
          stack.push(kid);
        }
      }
    }
    return set;
  }, [selectedId, inputLinks]);

  const dim = (id: string) => (highlighted && !highlighted.has(id) ? 0.15 : 1);

  const nodePos = new Map(nodesRef.current.map((n) => [n.id, n]));

  function pointerToWorld(e: React.PointerEvent) {
    const svg = e.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const py = ((e.clientY - rect.top) / rect.height) * HEIGHT;
    return { x: (px - view.x) / view.k, y: (py - view.y) / view.k };
  }

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-[60vh] w-full touch-none rounded-lg border bg-card"
      onWheel={(e) => {
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        setView((v) => ({
          ...v,
          k: Math.min(3, Math.max(0.4, v.k * factor)),
        }));
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const w = pointerToWorld(e);
        const n = nodePos.get(drag.current.id);
        if (n) {
          n.fx = w.x;
          n.fy = w.y;
          simRef.current?.alphaTarget(0.3).restart();
        }
      }}
      onPointerUp={() => {
        drag.current = null;
        simRef.current?.alphaTarget(0);
      }}
      onClick={() => onSelect(null)}
    >
      <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
        {inputLinks.map((l, i) => {
          const s = nodePos.get(l.source);
          const t = nodePos.get(l.target);
          if (!s || !t) return null;
          return (
            <line
              key={i}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              stroke="var(--color-border)"
              strokeWidth={1}
              opacity={Math.min(dim(l.source), dim(l.target))}
            />
          );
        })}
        {nodesRef.current.map((n) => {
          const st = TIER_STYLE[n.tier];
          const selected = n.id === selectedId;
          return (
            <g
              key={n.id}
              transform={`translate(${n.x},${n.y})`}
              opacity={dim(n.id)}
              className="cursor-pointer"
              onPointerDown={(e) => {
                e.stopPropagation();
                drag.current = { id: n.id };
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(n.id);
              }}
            >
              <circle
                r={st.r + (selected ? 3 : 0)}
                fill={st.fill}
                stroke={selected ? "var(--color-ring)" : "var(--color-background)"}
                strokeWidth={selected ? 3 : 1.5}
              />
              {st.label || selected ? (
                <text
                  x={st.r + 4}
                  y={4}
                  className="pointer-events-none fill-foreground text-[11px]"
                >
                  {n.name}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
```
(If a CSS variable like `--color-chart-2` is absent in `app/globals.css`, the inline fallback hex is used. Verify token names against `app/globals.css`; swap to existing ones if needed.)

- [ ] **Step 3: Create `components/cell-groups/unassigned-panel.tsx`.**

```tsx
"use client";

import { AlertTriangle } from "lucide-react";

import { assignMemberToCellGroup } from "@/app/(app)/cell-groups/actions";
import type { SelectOption } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function UnassignedPanel({
  people,
  cellOptions,
  canManage,
}: {
  people: { id: string; name: string }[];
  cellOptions: SelectOption[];
  canManage: boolean;
}) {
  return (
    <Card className="border-amber-500/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-amber-600 dark:text-amber-500">
          <AlertTriangle className="size-4" />
          {people.length} not in a cell group
        </CardTitle>
      </CardHeader>
      <CardContent>
        {people.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Everyone belongs to a cell group. 🎉
          </p>
        ) : (
          <ul className="max-h-[52vh] space-y-2 overflow-y-auto">
            {people.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="truncate">{m.name}</span>
                {canManage ? (
                  <form
                    action={assignMemberToCellGroup}
                    className="flex items-center gap-1"
                  >
                    <input type="hidden" name="memberId" value={m.id} />
                    <select
                      name="cellGroupId"
                      defaultValue=""
                      className="h-8 rounded-md border border-input bg-transparent px-2 text-xs outline-none"
                    >
                      <option value="" disabled>
                        Assign to…
                      </option>
                      {cellOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <Button type="submit" size="sm" variant="secondary">
                      Add
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Create the server page `app/(app)/cell-groups/page.tsx`.**

```tsx
import Link from "next/link";
import { asc } from "drizzle-orm";
import { Network, Plus } from "lucide-react";

import { db } from "@/db";
import { cellGroups, members } from "@/db/schema";
import { canManage, requireUser } from "@/lib/auth-helpers";
import { buildCellGraph } from "@/lib/cell-graph";
import { cn } from "@/lib/utils";
import { CellGroupsView } from "@/components/cell-groups/cell-groups-view";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";

export default async function CellGroupsPage() {
  const user = await requireUser();

  const [people, cells] = await Promise.all([
    db
      .select({
        id: members.id,
        name: members.fullName,
        cellGroupId: members.cellGroupId,
      })
      .from(members)
      .orderBy(asc(members.fullName)),
    db
      .select({
        id: cellGroups.id,
        name: cellGroups.name,
        leaderId: cellGroups.leaderId,
        parentCellGroupId: cellGroups.parentCellGroupId,
      })
      .from(cellGroups)
      .orderBy(asc(cellGroups.name)),
  ]);

  const graph = buildCellGraph(
    people.map((p) => ({ id: p.id, name: p.name, cellGroupId: p.cellGroupId })),
    cells.map((c) => ({
      id: c.id,
      leaderId: c.leaderId,
      parentCellGroupId: c.parentCellGroupId,
    })),
  );

  const unassigned = people
    .filter((p) => !p.cellGroupId)
    .map((p) => ({ id: p.id, name: p.name }));
  const cellOptions = cells.map((c) => ({ value: c.id, label: c.name }));
  const manage = canManage(user.role);

  return (
    <>
      <PageHeader
        title="Cell Groups"
        description={`${cells.length} cell group${
          cells.length === 1 ? "" : "s"
        } · ${graph.unassignedCount} not yet assigned`}
      >
        {manage ? (
          <Link href="/cell-groups/new" className={cn(buttonVariants())}>
            <Plus className="size-4" />
            New Cell Group
          </Link>
        ) : null}
      </PageHeader>

      {cells.length === 0 && unassigned.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
            <Network className="size-6 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-medium">No cell groups yet</h3>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Create your first cell group, then assign members to see the network
            graph.
          </p>
        </div>
      ) : (
        <CellGroupsView
          nodes={graph.nodes}
          links={graph.links}
          cells={cells}
          unassigned={unassigned}
          cellOptions={cellOptions}
          canManage={manage}
        />
      )}
    </>
  );
}
```

- [ ] **Step 5: Create the client shell `components/cell-groups/cell-groups-view.tsx`** (owns selection state + graph/list toggle, so the server page stays a server component):

```tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { List, Share2 } from "lucide-react";

import type { GraphLink, GraphNode } from "@/lib/cell-graph";
import type { SelectOption } from "@/components/form/form-select";
import { CellGraph } from "@/components/cell-groups/cell-graph";
import { UnassignedPanel } from "@/components/cell-groups/unassigned-panel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type CellRow = {
  id: string;
  name: string;
  leaderId: string | null;
  parentCellGroupId: string | null;
};

export function CellGroupsView({
  nodes,
  links,
  cells,
  unassigned,
  cellOptions,
  canManage,
}: {
  nodes: GraphNode[];
  links: GraphLink[];
  cells: CellRow[];
  unassigned: { id: string; name: string }[];
  cellOptions: SelectOption[];
  canManage: boolean;
}) {
  const [view, setView] = useState<"graph" | "list">("graph");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant={view === "graph" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("graph")}
        >
          <Share2 className="size-4" /> Graph
        </Button>
        <Button
          variant={view === "list" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("list")}
        >
          <List className="size-4" /> List
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <Legend color="var(--color-primary)" label="Leader of leaders" />
          <Legend color="#10b981" label="Leader" />
          <Legend color="var(--color-muted-foreground)" label="Member" />
          <Legend color="#9ca3af" label="Unassigned" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div>
          {view === "graph" ? (
            <CellGraph
              nodes={nodes}
              links={links}
              onSelect={setSelectedId}
              selectedId={selectedId}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">All cell groups</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {cells.map((c) => (
                    <li key={c.id} className="py-2 text-sm">
                      <Link
                        href={`/cell-groups/${c.id}`}
                        className="font-medium hover:underline"
                      >
                        {c.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {selected ? (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">{selected.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                <p className="capitalize">{selected.tier.replace(/-/g, " ")}</p>
                <p>{selected.downlineCount} people in their downline</p>
                {selected.cellGroupId ? (
                  <Link
                    href={`/cell-groups/${selected.cellGroupId}`}
                    className="text-foreground hover:underline"
                  >
                    Open their cell group →
                  </Link>
                ) : null}
                <Link
                  href={`/members/${selected.id}`}
                  className="block text-foreground hover:underline"
                >
                  Open member profile →
                </Link>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <UnassignedPanel
          people={unassigned}
          cellOptions={cellOptions}
          canManage={canManage}
        />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="inline-block size-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
```
(Add `components/cell-groups/cell-groups-view.tsx` to Task 7's file list.)

- [ ] **Step 6: Add the nav item.** In `components/app-sidebar.tsx`, add `Network` to the lucide import and insert into `NAV_ITEMS` after Members:

```ts
  { title: "Cell Groups", href: "/cell-groups", icon: Network },
```

- [ ] **Step 7: Verify build.**

Run: `pnpm build`
Expected: succeeds; `/cell-groups` route present, no type errors.

- [ ] **Step 8: Commit.**

```bash
git add components/cell-groups app/(app)/cell-groups/page.tsx components/app-sidebar.tsx package.json pnpm-lock.yaml
git commit -m "feat(cell-groups): interactive graph page with unassigned panel"
```

---

## Task 8: Seed data + full manual verification

**Files:**
- Modify: `db/seed.ts`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Add cell-group seeding.** In `db/seed.ts`, add `cellGroups` to the dynamic schema import line, and insert this block **after the members block and before the services block** (so a pre-existing services/enum issue can't block it). It captures member IDs by querying names created above:

```ts
  // --- Sample cell groups -------------------------------------------------
  const existingCells = await db.$count(cellGroups);
  if (existingCells === 0) {
    const { eq } = await import("drizzle-orm");
    const byName = async (name: string) =>
      (await db.query.members.findFirst({
        where: eq(members.fullName, name),
      }))?.id ?? null;

    const juan = await byName("Juan Dela Cruz"); // becomes leader-of-leaders
    const maria = await byName("Maria Santos"); // cell leader under Juan
    const pedro = await byName("Pedro Reyes"); // ordinary member in Maria's cell

    if (juan && maria) {
      const [root] = await db
        .insert(cellGroups)
        .values({
          name: "Pastor's Network",
          leaderId: juan,
          meetingDay: 0,
          meetingTime: "10:30",
          meetingLocation: "Main Sanctuary",
        })
        .returning({ id: cellGroups.id });

      const [anaCell] = await db
        .insert(cellGroups)
        .values({
          name: "Maria's Cell",
          leaderId: maria,
          parentCellGroupId: root.id,
          meetingDay: 3,
          meetingTime: "19:00",
          meetingLocation: "Room 2",
        })
        .returning({ id: cellGroups.id });

      // Leaders belong to the cell they lead; Pedro is a plain member.
      await db.update(members).set({ cellGroupId: root.id }).where(eq(members.id, juan));
      await db.update(members).set({ cellGroupId: anaCell.id }).where(eq(members.id, maria));
      if (pedro) {
        await db.update(members).set({ cellGroupId: anaCell.id }).where(eq(members.id, pedro));
      }
      console.log("  ✓ 2 sample cell groups created (some members left unassigned)");
    }
  } else {
    console.log(`  • Cell groups already present (${existingCells}), skipping`);
  }
```

- [ ] **Step 2: Run the seed.**

Run: `pnpm db:seed`
Expected: prints `✓ 2 sample cell groups created …` with no error. (If a pre-existing services-enum mismatch throws afterward, the cell-group seed has already committed — that failure is out of scope for this feature.)

- [ ] **Step 3: Verify the graph data end-to-end.**

Run:
```bash
pnpm tsx -e "
import('./db/index.ts').then(async ({db}) => {
  const { members, cellGroups } = await import('./db/schema.ts');
  const { buildCellGraph } = await import('./lib/cell-graph.ts');
  const people = await db.select({id:members.id,name:members.fullName,cellGroupId:members.cellGroupId}).from(members);
  const cells = await db.select({id:cellGroups.id,leaderId:cellGroups.leaderId,parentCellGroupId:cellGroups.parentCellGroupId}).from(cellGroups);
  const g = buildCellGraph(people, cells);
  console.log('tiers:', g.nodes.map(n=>n.name+':'+n.tier));
  console.log('unassignedCount:', g.unassignedCount, 'links:', g.links.length);
  process.exit(0);
});
"
```
Expected: Juan → `leader-of-leaders`, Maria → `leader`, Pedro → `member`, and `unassignedCount` ≥ 0 with at least one link (Maria→Juan, Pedro→Maria).

- [ ] **Step 4: Manual browser pass.** `pnpm dev`, sign in (`admin@church.local` / `admin123`), then:
  - Visit `/cell-groups`: the graph renders with Juan largest, Maria medium, Pedro small; the amber "not in a cell group" panel lists any unassigned members.
  - Click a node → the side panel shows tier + downline count + links; other branches dim.
  - Assign an unassigned member from the panel → they disappear from the panel and appear connected after refresh.
  - Toggle List view; open a cell group; edit it; set a parent that would cause a cycle and confirm the validation error.

- [ ] **Step 5: Run the full test suite once more.**

Run: `pnpm test`
Expected: all pure-logic tests pass.

- [ ] **Step 6: Commit.**

```bash
git add db/seed.ts
git commit -m "feat(cell-groups): seed sample network with unassigned members"
```

---

## Self-Review Notes

- **Spec coverage:** data model (Task 1) ✓; unassigned = `cellGroupId IS NULL` (Task 1/2/7) ✓; leader-in-own-cell convention (Task 2 logic + Task 4 create/promote + Task 8 seed) ✓; cell CRUD (Tasks 4–5) ✓; assignment + quick-assign (Tasks 4, 6, 7) ✓; promote-to-leader (Tasks 4, 6) ✓; force-directed graph with tier color/size, labels, click-focus/side-panel, separated unassigned cluster, legend, zoom/pan/drag (Task 7) ✓; roles view/mutate (throughout) ✓; nav (Task 7) ✓; seed (Task 8) ✓; history deferred (no task) ✓; `userId` column added, no UI (Task 1) ✓; modified-Next doc reads (Global Constraints + Task 4/others) ✓.
- **Type consistency:** `buildCellGraph`/`wouldCreateCycle`/`GraphNode`/`GraphLink`/`CellGroupFormState`/`cellGroupSchema`/`assignSchema`/`CellGroupForm` props/`SelectOption` used identically across tasks. `components/cell-groups/cell-groups-view.tsx` is created in Task 7 Step 5 and listed as a produced file.
- **Search/filter:** the spec mentioned graph search + active/inactive filter as nice-to-haves; v1 ships selection-focus + graph/list toggle + legend. Search is a small follow-up — noted here rather than silently dropped.
