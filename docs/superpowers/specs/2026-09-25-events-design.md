# Events — Design

**Date:** 2026-09-25
**Status:** Draft

## 1. Purpose

Staff need somewhere to plan things that are not a routine worship service,
such as a youth camp, a couples' retreat, a medical mission, an anniversary
celebration, a water baptism, or a leadership summit. These have a category,
often run across several days, and will eventually carry more information,
such as who registered, who is serving, what it costs, and who spoke.

Today the only related concept is `services.type = "special_event"`: one row,
one timestamp, no category, no end time, and nothing can be attached to it.

This spec introduces **events** as a first-class module. It keeps v1 small and
fixes the shape that later concepts attach to.

### Goals

- An event has a **category**, a start and an end, a location, and a
  description.
- Categories are **data**, not code, so the church can add "Kasalan" or
  "Outreach" without a deploy.
- Events can **take attendance** through the existing check-in flow, face and
  name search included, without a second attendance system.
- Later concepts, such as registration, volunteers, fees, and speakers, attach
  as **child tables keyed by `event_id`** and are switched on per category.
  None of them should need a change to `events` itself.

### Non-goals (v1)

- Recurring events. Recurrence stays with `service_schedules`.
- Registration/RSVP, volunteers, fees, and speakers. These are designed for in
  §7 but not built.
- A public or member-facing event page.
- A calendar view. v1 is a `DataTable`. A calendar is a phase-4 candidate.

## 2. Terminology

- **Event** is the planning umbrella, e.g. "Youth Camp 2026, 12–14 Dec,
  Tagaytay".
- **Category** is the kind of event, e.g. Camp, Retreat, Outreach, Conference,
  Celebration, or Baptism.
- **Session** is a single gathering within an event where attendance is taken,
  e.g. "Day 1 Morning". A session **is a `services` row** with `event_id` set.
- **Service** is unchanged: a worship gathering where attendance is taken.
  It is either one-off or generated from a schedule.

## 3. The key decision: sessions are services

There are three ways to let an event take attendance:

| Option | Cost |
| --- | --- |
| A. Separate `event_attendance` table | Duplicates the `(member, gathering)` uniqueness invariant, the check-in actions, `/scan`, face matching, Sheets sync, and every attendance report. |
| B. Rename `services` → `events` and make "service" a category | Correct in the abstract, but it rewrites the most-used module, the scan flow, and schedule generation in one go, and it blocks on no user need. |
| **C. `services.event_id` (nullable FK)** | One column. `/scan`, face check-in, `recordAttendance`, the duplicate-scan invariant, and Sheets sync all work unchanged, because a session *is* a service. |

**Choose C.** An event owns zero or more sessions. An event without sessions,
such as a planning-only event or one where attendance is not taken, is valid.
A multi-day camp owns one session per day, or per meal/talk if the organisers
want that granularity.

Consequences:

- `/scan` already lists services in a window around now, so event sessions
  appear there with no scan changes. The picker should show the event name
  next to the session name (§6.4).
- An event's attendance is the **union of its sessions' attendance**: unique
  attendees = `COUNT(DISTINCT member_id)` across its sessions.
- Deleting an event **must not** cascade to its sessions' attendance by
  accident. `services.event_id` is `ON DELETE SET NULL`, and the delete action
  refuses when any session has attendance. This matches how schedules protect
  scanned occurrences.
- Option B stays open. If services later become one category among many, C is
  the stepping stone, because sessions already live under events.

## 4. Data model

### 4.1 `event_categories`

```ts
export const eventCategories = pgTable("event_categories", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  description: text("description"),
  // One of a fixed set of chart/badge tokens (see §6.5), never a hex value.
  color: text("color", { enum: EVENT_CATEGORY_COLORS }).notNull().default("chart-1"),
  // Built-in categories keep stable ids for seeds and cannot be deleted,
  // mirroring roles.is_system.
  isSystem: boolean("is_system").notNull().default(false),
  // Hidden from the new-event picker, but existing events keep it.
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt, updatedAt,
});
```

Seeded, as `is_system`: **Camp**, **Retreat**, **Conference**, **Outreach**,
**Celebration**, **Baptism**, and **Other**. Names are editable and the church
can add more.

**Categories are rows, not a TS enum.** The house pattern is text-enum
columns, and that is right for values the code branches on, such as member
status. Categories are content: the church will name them, and no code path
should say `if (category === "camp")`. Behaviour that *does* differ by
category goes through feature flags on the category row (§7.1), never through
its name.

### 4.2 `events`

```ts
export const events = pgTable("events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  categoryId: text("category_id").notNull()
    .references(() => eventCategories.id, { onDelete: "restrict" }),
  description: text("description"),
  location: text("location"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  // Nullable: a single-moment event has no meaningful end. Validated >= startsAt.
  endsAt: timestamp("ends_at", { withTimezone: true }),
  // Render dates without times; startsAt/endsAt then hold local midnight.
  allDay: boolean("all_day").notNull().default(false),
  status: text("status", { enum: ["scheduled", "cancelled"] })
    .notNull().default("scheduled"),
  // Optional free-text organiser; a member link is a §7 concept.
  notes: text("notes"),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt, updatedAt,
}, (t) => [
  index("events_starts_at_idx").on(t.startsAt),
  index("events_category_id_idx").on(t.categoryId),
  index("events_status_idx").on(t.status),
]);
```

- **Upcoming, ongoing, and past are derived** from `startsAt`/`endsAt` against
  now and are never stored. Only `cancelled` is a human decision, so it is the
  only stored status. `postponed` is just an edit to the dates.
- `onDelete: "restrict"` on the category means a category that is in use
  cannot be deleted. It can be deactivated instead.

### 4.3 `services.event_id`

```ts
eventId: text("event_id").references(() => events.id, { onDelete: "set null" }),
// + index("services_event_id_idx").on(t.eventId)
```

The session form sets `type = "special_event"` for sessions, so existing
service-type facets and reports keep a sensible bucket.

### 4.4 Timezone

`lib/occurrences.ts` does its date maths in the server's local zone, and on
Vercel `sin1` that zone is UTC, not Manila. Events are entered as local
Philippine dates and times. The event validator and formatter must parse and
render in **`Asia/Manila`** explicitly, not in the process zone. This is
especially true for `allDay`, where a UTC midnight is 08:00 in Manila. Put the
conversion in `lib/event-dates.ts` with unit tests. Whether occurrences have
the same latent bug is a separate issue worth filing.

## 5. Authorization

A new `events` module in `lib/permissions.ts`:

| Key | Admin | Leader | Usher |
| --- | --- | --- | --- |
| `events.view` | ✓ | ✓ | ✓ |
| `events.create` | ✓ | ✓ | |
| `events.update` | ✓ | ✓ | |
| `events.delete` | ✓ | | |
| `events.manage_categories` | ✓ | | |

Adding and removing sessions is `events.update`. Taking attendance at a
session stays `attendance.record`, because it is a service. The migration adds
the permission rows and grants, following `docs/authorization.md`.

## 6. UI

Build each piece in Storybook first, as `AGENTS.md` requires. Everything here
composes existing patterns: `PageHeader`, `DataTable`, `DetailList`,
`StatCard`, `EmptyState`, `BackLink`, `Field`, and `FormSelect`.

### 6.1 `/events` — list

A `DataTable` following `app/(app)/members/page.tsx`:

- Columns: name, category (badge), when (a range, formatted en-PH), location,
  sessions, and attendees.
- Search on name and location. Facets are **category** and **when**
  (upcoming · ongoing · past · cancelled), where "when" compiles to a `WHERE`
  on the dates.
- Sort keys are `starts` (default ascending for upcoming) and `name`. The
  `orderBy` ends with `events.id`.
- `emptyFiltered` is separate from `empty`; only `empty` offers "New event".

### 6.2 `/events/new`, `/events/[id]/edit` — form

The `service-form.tsx` shape: a server action over `FormData`, an
`eventSchema` in `lib/validators.ts`, and `useActionState`. Fields are name,
category (`FormSelect` over active categories), all-day toggle, start, end,
location, description, and notes. Cancelling is a status toggle on edit, not
a delete.

### 6.3 `/events/[id]` — detail

- A header with category badge, status, and date range, plus Edit and Delete
  actions gated by permission.
- A `DetailList` of the fields.
- Stat cards for sessions and unique attendees.
- A **Sessions** `DataTable` with columns for session name, when, and
  checked-in count, where each row links to `/services/[id]`. An "Add session"
  action opens a small form (name, date and time) that inserts a `services`
  row with `eventId`. For multi-day events, a shortcut adds one session per
  day in the range at a chosen time.

### 6.4 Touch points outside `/events`

- **Sidebar**: an "Events" item, shown when the user has `events.view`.
- **`/scan` picker**: a session renders as "Youth Camp · Day 1". This is a
  one-join change to the picker query.
- **`/services/[id]`**: when `eventId` is set, a `BackLink`-style "Part of
  *Youth Camp 2026*" link.
- **Dashboard**: an "Upcoming events" card showing the next three. This is
  optional in v1.

### 6.5 Category colour

The category colour is a **name from a fixed token list** (`chart-1` …
`chart-5`, already in `globals.css` for both themes). It is never a hex value
and never a Tailwind palette class. This keeps `tests/ui/design-tokens.test.ts`
green. A runtime badge reads the raw `--chart-n` variable, per `AGENTS.md`. A
new `EventCategoryBadge` component in `components/events/` gets a story that
shows every colour in both themes.

### 6.6 `/events/categories` — manage

This page is gated by `events.manage_categories`. It is a small `DataTable`
with name, colour, number of events, and active status, plus an inline
create/edit form. Delete is offered only when no event uses the category and
it is not `is_system`. Otherwise the page offers deactivate.

## 7. Attaching concepts later

Each concept is a child table keyed by `event_id` with `ON DELETE CASCADE`,
plus a flag on the **category** that turns its UI on by default. An
per-event override is added only if a real need appears. `events` itself does
not change.

### 7.1 Category feature flags

These are boolean columns on `event_categories`, added with the feature that
reads each one. They are not added speculatively, and they are not a `jsonb`
bag:

- `registration_enabled`: Camp, Retreat, Conference
- `volunteers_enabled`: Outreach, Conference
- `fees_enabled`: Camp, Retreat

Typed columns keep them queryable and validated. A `jsonb` "settings" blob
would move validation into every reader.

### 7.2 Candidate concepts

| Concept | Table sketch | Notes |
| --- | --- | --- |
| Registration / RSVP | `event_registrations(event_id, member_id?, guest_name?, guest_contact?, status, registered_at)`, unique `(event_id, member_id)` | Guests cover visitors. Ties into #19 (register a first-time visitor). Capacity would be a column on `events` when this lands. |
| Volunteers / roles | `event_roles(event_id, name)` + `event_volunteers(event_role_id, member_id)` | "Worship", "Registration desk", "Kitchen". |
| Fees & payments | `event_fees(event_id, label, amount_centavos)` + `event_payments(registration_id, amount_centavos, paid_at, method)` | Store integer centavos, never floats. |
| Speakers / program | `event_program_items(event_id, session_id?, title, speaker_member_id?, speaker_name?, starts_at)` | Can hang off a session. |
| Audience | `event_audiences(event_id, cell_group_id)` | "For the Tagaytay network". Drives absentee-style reports (#24). |
| Recurring events | reuse the `service_schedules` pattern with `event_id` | Only when a real recurring non-service event appears. |

## 8. Delivery plan

Each phase is one PR and is independently shippable.

**Phase 1: data and permissions**
1. Schema: `event_categories` and `events`, plus `services.event_id` and its
   index. `bun run db:generate`.
2. In the same migration, seed the system categories and add the `events.*`
   permission rows and grants.
3. Add `lib/event-dates.ts` (Manila parsing, range formatting, and deriving
   upcoming/ongoing/past) with `bun test lib` coverage.
4. Add `eventSchema` and `eventCategorySchema` in `lib/validators.ts` with
   tests: `endsAt >= startsAt` and empty strings become null.
5. Add the `events` module to `lib/permissions.ts` and update
   `permissions.test.ts`.

**Phase 2: components in Storybook**
1. `EventCategoryBadge` covering every colour and both themes.
2. `EventForm` covering its default, validation-error, all-day, and pending
   states, driven by a stub action.
3. `EventSessionsCard` covering its empty, populated, and read-only
   (no `events.update`) states.
4. Add `tests/ui` coverage via `composeStories`.

**Phase 3: routes**
1. `/events` list, `/events/new`, `/events/[id]`, `/events/[id]/edit`, and
   `actions.ts`. Every page calls `requirePermission`, and so does every
   action.
2. Add-session and add-a-session-per-day actions.
3. Delete action that refuses when sessions have attendance.
4. Sidebar item, `/scan` picker label, and back link on `/services/[id]`.
5. Integration tests: create an event, add sessions, check in, confirm the
   unique-attendee count, and confirm delete is blocked.
6. E2E: an admin creates a camp with three day-sessions and one appears in
   `/scan`.

**Phase 4: categories and polish**
1. `/events/categories` management.
2. Dashboard "Upcoming events" card.
3. Optional: a month calendar view over the same query.

**Phase 5 (optional): retire `special_event` services**
Migrate each `services` row with `type = "special_event"` and no `eventId`
into an event with category Other and that row as its only session. Then drop
`special_event` from the services form so new ones go through `/events`. The
enum value stays for the migrated sessions.

After this, §7 concepts land one per PR, each adding its child table and its
category flag.

## 9. Open questions

These have defaults, so they do not block Phase 1:

1. **Can leaders create events**, or only admins? *Default: leaders can create
   and edit, only admins delete.* (The §5 grants.)
2. **Seed category list**: are these seven right for IRM, and what Taglish
   names do they use? *Default: seed the English names; they are editable.*
3. **Should services eventually become an event category** (Option B)?
   *Default: no, not until a need for it appears. C does not prevent it.*
4. **Which §7 concept comes first?** *Likely registration, because it connects
   to visitor registration (#19).*
