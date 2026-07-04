# Cell Groups — Design

**Date:** 2026-07-04
**Status:** Approved
**Amended 2026-07-04:** target database changed from Postgres to **SQLite (libSQL / Turso on prod)**, tracking a parallel Postgres→SQLite refactor of the base tables. Only the data-model dialect (§3) and implementation constraints (§10) change; the feature design, derivations, and graph are unchanged.

## 1. Purpose

Introduce **cell groups** (discipleship cells) to the church management system so staff can:

- Record which cell group each member belongs to, who leads it, and how the
  cells nest into an upline network ("leaders of leaders").
- See the whole structure at a glance in an **interactive force-directed graph** —
  leaders-of-leaders → leaders → members.
- **Immediately spot members who are not yet in any cell group.**

Today the system has no concept of a cell. "Leader" exists only as a login role on
`users`. This feature adds the underlying data model plus management UI, then the
graphic on top.

### Goals
- One clean source of truth for cell membership and leadership.
- "Not in a cell group" is a single trivial query (`cellGroupId IS NULL`).
- A readable graph despite the force-directed layout the user chose.

### Non-goals (explicitly deferred)
- **History / audit trail** of assignments and promotions over time. v1 shows the
  *current* picture only.
- Leaders logging in to see only their own cell (the `userId` link is added now as
  the mechanism, but the scoped-login experience is future work).
- Attendance-by-cell reporting.

## 2. Terminology

- **Cell Group** — the group itself (nav item: "Cell Groups", route: `/cell-groups`).
- **Leader** — the member who leads a cell group (`cellGroups.leaderId`).
- **Upline / parent** — the cell group above this one (`cellGroups.parentCellGroupId`).
  A leader whose cell has child cells is a "leader of leaders".
- **Unassigned** — a member with no cell group.

## 3. Data model

### 3.1 New table `cell_groups`

Drizzle SQLite (`drizzle-orm/sqlite-core`), mirroring the refactored base tables'
id/timestamp/boolean conventions:

```ts
export const cellGroups = sqliteTable("cell_groups", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  // The member who leads this cell. Nullable so a cell can briefly exist
  // leaderless (e.g. leader deleted); UI flags this state.
  leaderId: text("leader_id").references(() => members.id, {
    onDelete: "set null",
  }),
  // The upline cell. This nesting is what produces "leaders of leaders".
  parentCellGroupId: text("parent_cell_group_id").references(
    (): AnySQLiteColumn => cellGroups.id,
    { onDelete: "set null" },
  ),
  // Meeting details.
  meetingDay: integer("meeting_day"),        // 0 = Sunday .. 6 = Saturday
  meetingTime: text("meeting_time"),         // "HH:mm" 24h
  meetingLocation: text("meeting_location"),
  notes: text("notes"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
```

(Self-reference uses `AnySQLiteColumn` per Drizzle's self-FK pattern. The id/
timestamp/boolean helpers assume the refactor's conventions — text UUID PKs,
`integer` timestamps, `integer` booleans; match whatever the base tables adopt.)

### 3.2 New columns on `members`

```ts
// The cell group this person belongs to. NULL = "not yet in any cell group".
cellGroupId: text("cell_group_id").references((): AnySQLiteColumn => cellGroups.id, {
  onDelete: "set null",
}),
// Links a member to their staff login, when they also log in.
// This reconciles the "leaders can be staff OR ordinary members" requirement:
// every leader is a member node; staff-leaders additionally point at their user.
userId: text("user_id").references(() => users.id, { onDelete: "set null" }).unique(),
```

### 3.3 Relations
- `cellGroups.leader` → one member (`leaderId`).
- `cellGroups.parent` → one cell group (`parentCellGroupId`); `cellGroups.children` → many.
- `cellGroups.members` → many members (`members.cellGroupId`).
- `members.cellGroup` → one cell group; `members.user` → one user; `members.ledCellGroups` → many.

### 3.4 Membership convention (important, resolves ambiguity)

**A cell group's leader belongs to the cell group they lead.** i.e. for leader `L`
of cell `X`: `L.cellGroupId = X.id`. Consequences, all consistent:

- Ordinary member `M` of `X`: `M.cellGroupId = X.id`, discipled by `X.leaderId`.
- `L`'s own upline = the leader of `X.parentCellGroup` (if any).
- A **top leader** (e.g. pastor) leads a root cell (`parentCellGroupId = NULL`) and
  belongs to it, so they are **not** flagged unassigned.
- **Unassigned = `members.cellGroupId IS NULL`** — nothing more. Single clean query.

### 3.5 Derivations (computed server-side, no stored hierarchy table)

For each member `P`, let `C = P.cellGroupId`'s cell group:
- `C` is `NULL` → **unassigned**; no upline edge; floats in the graph.
- `C.leaderId == P.id` → `P` leads `C`; upline = leader of `C.parent` (else `P` is a root).
- otherwise → upline = `C.leaderId`.

**Tier** (drives node size/color):
- `unassigned` — `cellGroupId IS NULL`.
- `leader-of-leaders` — leads a cell that has ≥1 child cell.
- `leader` — leads a cell with no children.
- `member` — belongs to a cell, leads none.

## 4. Feature surface

Routes mirror the existing `members` pattern (list / new / `[id]` / `[id]/edit`).

| Route | Purpose |
|---|---|
| `/cell-groups` | **Headline page.** Default **Graph** view + summary strip + a prominent **"⚠ N not in a cell group"** panel. A **List** toggle (search param `?view=list`) shows a table of cells. |
| `/cell-groups/new` | Create a cell group. |
| `/cell-groups/[id]` | Cell group detail: meeting info, leader, members, child cells; quick actions. |
| `/cell-groups/[id]/edit` | Edit / deactivate / delete a cell group. |

Plus:
- **Member assignment** — add a "Cell Group" `<Select>` to the member new/edit form
  (`app/(app)/members/...`), and **quick-assign** directly from the unassigned panel
  on `/cell-groups`.
- **Promote to leader** = create a cell group with that member as `leaderId`; set the
  member's `cellGroupId` to the new cell and reassign their disciples to it. No
  separate machinery.
- **Nav** — add "Cell Groups" to `components/app-sidebar` (lucide icon, e.g. `Network`
  or `Users`).

### Permissions
- **View** (`/cell-groups`, detail): any logged-in user (`requireUser`).
- **Mutate** (create/edit/delete/assign/promote): `requireRole(["admin", "leader"])`,
  matching existing member actions.

## 5. Server actions & validation

New `app/(app)/cell-groups/actions.ts` following the `members/actions.ts` shape
(`"use server"`, `requireRole`, drizzle, `revalidatePath`, `redirect`):

- `createCellGroup`, `updateCellGroup`, `deleteCellGroup`.
- `assignMemberToCellGroup(memberId, cellGroupId | null)` — used by the member form
  and the quick-assign panel.
- `promoteMemberToLeader(memberId, { name, parentCellGroupId? })` — creates the cell,
  reassigns as described in §4.

New zod schema in `lib/validators.ts` (`cellGroupSchema`): `name` required;
`leaderId` optional (must be an existing member); `parentCellGroupId` optional;
`meetingDay` 0–6 optional; `meetingTime` `HH:mm` optional; `meetingLocation`/`notes`
optional; `active` boolean.

**Validation guards:**
- `parentCellGroupId` must not equal the cell's own id and must not create a **cycle**
  (walk the parent chain; reject if the cell reappears).
- Assigning a member to a cell must not make a person their own upline (defensive;
  primarily prevented by the parent-cycle guard).
- Deleting a cell warns first: its members become unassigned and its child cells
  become roots (both via `onDelete: set null`).

## 6. The graph

**Tech:** add **`d3-force`** (simulation only) and render as a **React-controlled
`<svg>`** in a client component. Chosen over heavier canvas libs
(react-force-graph) for label legibility, crisp click targets, and theming with the
existing Tailwind/Base-UI tokens. Simulation runs in a `useEffect`; positions drive
SVG `<circle>`/`<line>`/`<text>`. Respect `prefers-reduced-motion` (settle quickly /
allow a static layout).

**Server → client data shape** (computed on the server component for `/cell-groups`):
```ts
type GraphNode = {
  id: string; name: string;
  tier: "leader-of-leaders" | "leader" | "member" | "unassigned";
  cellGroupId: string | null; cellGroupName: string | null;
  downlineCount: number;   // people below them; also drives node size
};
type GraphLink = { source: string; target: string }; // person → upline person
```

**Legibility mitigations (the user chose the force graph knowing the tradeoff):**
- Node **size + color by tier**; unassigned in a distinct muted grey.
- **Leader labels always shown**; member names on hover, or when a branch is focused.
- **Click a person → focus**: highlight their sub-tree, dim the rest, open a side
  panel (cell name, meeting day/time/place, leader, member list, quick actions).
- **Unassigned people rendered as a separate cluster** pinned to one side, visually
  detached from the connected network, headed by the **"⚠ N not in a cell group"**
  count with one-click assign.
- **Search** a person → graph pans/highlights. **Legend** for tiers.
- **Filter** by root network and active/inactive.

**Scale:** SVG force layout targets up to a few hundred members (typical single
church). If a congregation is much larger, note a follow-up to switch rendering to
canvas or collapse cells to counts. Defensive `visited` set guards against any
accidental cycle while walking the graph.

## 7. Seed data

Extend `db/seed.ts`: create a small network (e.g. a pastor's root cell with 2 child
cells and their leaders/members) and **leave several members unassigned**, so the
graph and the unassigned panel are both populated on first run.

## 8. Implementation phases

1. **Data model** — `cell_groups` table, `members.cellGroupId` + `userId`, relations,
   generated migration (`db:generate`), seed update.
2. **Management + assignment** — cell-group CRUD pages/actions, validators, member-form
   cell field, quick-assign, promote-to-leader, sidebar nav.
3. **The graph** — server query → nodes/links, `d3-force` client component, unassigned
   panel, focus/side-panel/search/legend interactions.

## 9. Testing

- **Derivation unit tests** (pure functions, no DB): upline resolution, tier
  classification, unassigned detection, and cycle-guard — cover root leader, leader in
  own cell, ordinary member, unassigned, and a deliberately malformed cycle.
- **Action tests** against a test DB where practical: create/edit/delete cell group,
  assign/unassign member, promote-to-leader reassignment, parent-cycle rejection.
- **Manual/e2e smoke**: seed → `/cell-groups` shows the network and the unassigned
  panel; assigning a member removes them from the panel and reveals an edge.

## 10. Implementation constraints

- **Database is SQLite (libSQL / Turso on prod), built on a parallel Postgres→SQLite
  refactor.** Implement this feature only after that refactor lands. Use
  `drizzle-orm/sqlite-core` (`sqliteTable`, `text`, `integer`, `AnySQLiteColumn`) and
  **mirror the refactored base tables' id/timestamp/boolean column conventions.** FK
  column types must match the referenced PK type. Because ids may be UUID or nanoid,
  validators require only a non-empty string for id references (the DB foreign key
  enforces real validity). SQLite enforces FK cascades (`onDelete: "set null"`) only
  with `PRAGMA foreign_keys = ON` — verify the libSQL client keeps it on.
- **This is a modified Next.js (see `AGENTS.md`).** Before writing any route, page,
  server action, or data-fetching code, read the relevant guide under
  `node_modules/next/dist/docs/` — APIs and conventions may differ from stock Next 16.
- Follow the **shadcn Base UI variant** already in use: components use `render` (not
  `asChild`); `Select` uses `name`/`items`; there is no `form.tsx`.
- Match existing patterns: server actions with `requireRole`, zod validators in
  `lib/validators.ts`, `revalidatePath`/`redirect`, Drizzle query style.
```
