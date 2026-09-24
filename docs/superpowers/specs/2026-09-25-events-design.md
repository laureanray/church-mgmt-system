# Events — Design

**Date:** 2026-09-25
**Status:** Draft, awaiting review
**Implementation plan:** `docs/superpowers/plans/2026-09-25-events.md`
**Revision 3:** events are single-day and have their own attendance; sessions-as-services is dropped (§3.1).

## 1. Purpose

Staff need one place to run everything that is not a routine worship service:
a leadership summit, a youth conference, a medical mission, a water baptism,
a fellowship night, or an anniversary celebration. Running one means:

1. **Planning it**: a checklist of who does what by when, working back from
   the event date.
2. **Scheduling the program**: the run of show for the day, with talks,
   worship, meals, and breaks.
3. **Taking registrations**: who is coming, which fee tier they are on, and
   whether the event is full.
4. **Collecting fees**: what each registrant owes, what they have paid by
   cash or GCash, and what is outstanding.
5. **Taking attendance** on the day, through the `/scan` page, recorded
   against the event itself.

Today the only related concept is `services.type = "special_event"`. It is a
single timestamp with no category, no end date, and nothing attached to it.

This design builds all five pieces **specifically for events**. Pure logic
(Manila time, money, balances, due-date shifting) lives in `lib/`. Generic UI
(a member picker, link tabs, a timeline) lives in `components/form` and
`components/patterns`. That way cell groups or services can reuse them later
without the events tables being generalised in advance.

### Non-goals

- **Multi-day events.** In v1 an event is one gathering on one day. §3.1
  describes how multi-day events would be added later without reworking this
  design.
- Recurring events. Recurrence stays with `service_schedules`.
- Public or self-service registration. Staff register people, and a
  member-facing portal is issue #32's territory.
- Online payment collection. Payments are **recorded** here and collected in
  person or by GCash or bank transfer outside the app.
- A budget or expense ledger. Only income from fees is tracked. Expenses are
  candidate follow-up work (§12).
- Volunteer rosters beyond task assignees.

## 2. Terminology

| Term | Meaning |
| --- | --- |
| **Event** | One gathering on one day, e.g. "Youth Leadership Summit, Sat 12 Dec 2026, 8 AM–5 PM, Main Hall". |
| **Category** | The kind of event, e.g. Conference, Outreach, or Fellowship. Staff-editable data. |
| **Event attendance** | One member checked in to one event. It is recorded in `event_attendance`, **not** in the services `attendance` table. |
| **Program item** | One entry in the run of show, e.g. "9:00 Worship" or "10:00 Talk: Identity, Ptr. Santos". |
| **Task** | One planning checklist item with an optional due date and assignee. A **milestone** is a task flagged as a key date. |
| **Fee** | A price tier on an event, e.g. "Early bird ₱1,200 until 30 Nov", "Regular ₱1,500", or "Child ₱800". |
| **Registration** | One member signed up for one event, with the amount they owe. |
| **Payment** | One recorded amount received against a registration. It is never edited, only voided. |

## 3. Key decisions

### 3.1 An event is one gathering with its own attendance

An event is a single gathering on a single Manila day, and people check in to
**the event itself**. Its check-ins live in a dedicated `event_attendance`
table with the same shape and the same invariant as the services
`attendance` table: one row per member per event, unique, with a duplicate
detected by an empty `returning()` after `onConflictDoNothing()`.

**Services are not touched.** Service attendance, the dashboard's check-in
counts, member attendance history, service reports, and the Google Sheets
sync keep reading only `attendance`, so events cannot skew them or be deleted
through them. Where a screen should show both, such as a member's history,
it reads both tables deliberately (phase 6).

**Check-in is shared up to the last step.** Resolving *who* is being checked
in (today a QR token, later face match #16 or name search #18), the
reactivate-inactive-member prompt, and the result display are the same for
services and events. Only the final insert differs. `/scan` therefore picks a
**check-in target**, `{ kind: "service" | "event", id }`, and one server-side
`checkIn(target, …)` inserts into the right table (§7.4).

Two alternatives were rejected:

- **Event sessions as `services` rows** (an earlier draft of this design).
  That mixed event check-ins into service attendance, needed guards in the
  services module so a services-page delete could not wipe an event's
  attendance, and existed only to support multi-day events.
- **One attendance table with either `service_id` or `event_id`.** This has
  less duplication, but every existing attendance query, count, and the
  Sheets sync would need an extra filter to exclude event rows, which is the
  same coupling again.

**Multi-day events later** would add an `event_sessions` table inside the
events module (never `services`), add a nullable `session_id` to
`event_attendance`, and move the unique key to `(session_id, member_id)`.
`starts_at`/`ends_at` are already a range, so the events table itself would
not change. Only the v1 same-day validator would be relaxed.

### 3.2 Every registrant is a member

A registration always points at a `members` row. Someone new, such as a
friend invited to a conference, is created **inline as a member with status
`visitor`**. The visitor status already exists and is in the directory's
default view. This means:

- Registrants check in at `/scan` like anyone else, because event attendance
  is keyed by member. The registration list can then show who arrived with a
  simple join on `(event_id, member_id)`.
- There are no parallel guest name and contact columns to reconcile later.
- It overlaps directly with #19, "Register a first-time visitor at the door".
  The inline visitor form built here is the component #19 needs.

The cost is visitor rows in the directory. That is the directory's job, and
the status facet already filters by it.

### 3.3 Money is integer centavos, and payments are append-only

- Every amount is stored as `integer` **centavos**. Floating-point pesos are
  never stored. `lib/money.ts` parses "1,500.50" and formats `₱1,500.50` with
  `Intl` `en-PH`/`PHP`.
- A registration **snapshots** `charge_centavos`, the original charge, when
  it is created. Editing a fee's price later does not change what earlier
  registrants owe. Changing a registration's charge, whether through a manual
  adjustment such as a scholarship or a fee-tier change, is appended to
  `event_registration_charge_changes` with the old amount, the new amount, the
  actor, the time, and a reason. It never overwrites the history.
- Payments are **never updated or deleted**. A mistake is **voided**, which
  records who voided it, when, and why, and is then re-entered. Volunteers
  handle cash, and the ledger has to be auditable without a general audit log
  (#30). Any payment row, **voided or not**, makes its registration and its
  event undeletable.
- **The charge is not the same as what is currently owed.** What a person owes
  right now is the **effective amount due**, derived from the registration
  status and the event status:

  | Situation | Effective amount due |
  | --- | --- |
  | Registration `registered`, event `scheduled` | `charge_centavos` |
  | Registration `waitlisted` | 0. A payment taken from someone on the waitlist is held as a credit. |
  | Registration `cancelled` | `retained_centavos`, the non-refundable part staff chose to keep when cancelling. It defaults to 0. |
  | Event `cancelled`, any registration | 0. Everything paid becomes refund due. |

- **Settlement is per registration.** For each registration,
  `paid = Σ non-voided payments`, `outstanding = max(0, effective − paid)`,
  and `refund_due = max(0, paid − effective)`. Event totals **sum those
  per-registration figures**. One person's overpayment never offsets another
  person's debt. Nothing here is stored.

  For example, someone with a ₱1,500 charge who has paid ₱500 cancels. Their
  effective amount due becomes ₱0 (or the retained amount), so the screen
  shows **₱500 refund due**, not ₱1,000 outstanding. The ₱1,500 charge stays
  on record.

### 3.4 Categories are rows; category behaviour is typed columns

Categories are content the church names, so they live in `event_categories`,
not a TypeScript enum. No code branches on a category's name. What a
category changes is defaults, held in **typed boolean columns** on the
category, such as "registration on by default". A `jsonb` settings bag is not
used.

### 3.5 Only "cancelled" is stored; the rest is derived

Upcoming, ongoing, and past come from `starts_at`/`ends_at` against now.
Registration being open, not yet open, closed, or full comes from the
registration window and capacity. The same holds for task overdue state and
payment state. Status columns exist only where a person decides something:
the event is cancelled, a registration is cancelled or waitlisted, or a task
is done.

### 3.6 Everything is in Manila time

The app's date handling uses the process time zone, and Vercel `sin1` runs in
**UTC**. `services/actions.ts` does `new Date(scheduledAt)` on a
`datetime-local` string, which parses it as UTC in production, so it is 8
hours off. Events do not inherit this. `lib/manila-time.ts` converts between
`datetime-local` / `YYYY-MM-DD` strings and instants **explicitly in
`Asia/Manila`**, and every event form, program item, and task due date goes
through it. The same bug in services should be filed and fixed separately.

## 4. Data model

The tables follow house conventions: text UUID primary keys,
`timestamp({ withTimezone: true })`, text-enum columns constrained in
TypeScript, `createdAt`/`updatedAt`, and an index on every foreign key and
sort column.

### 4.1 `event_categories`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | System rows use stable ids: `conference`, `training`, `outreach`, `fellowship`, `celebration`, `baptism`, `other`. |
| `name` | text, unique | |
| `description` | text? | |
| `color` | text enum `chart-1`…`chart-5` | A token name, never a hex value (§8.5). |
| `registration_default` | boolean, default false | Prefills `events.registration_enabled`. True for conference and training. |
| `is_system` | boolean | Cannot be deleted. The name stays editable. |
| `active` | boolean | Inactive categories are hidden from the new-event picker. |
| `sort_order` | integer | |

### 4.2 `events`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | |
| `name` | text | |
| `category_id` | FK → categories, `restrict` | A category in use cannot be deleted. It can be deactivated instead. |
| `description`, `location`, `notes` | text? | |
| `starts_at` | timestamptz | |
| `ends_at` | timestamptz | **Required**, and after `starts_at`. In v1 the validator also requires it to fall on the **same Manila day** as `starts_at`. That rule lives in the validator, not the database, so multi-day can be allowed later without a migration (§3.1). |
| `all_day` | boolean | When true, `starts_at` and `ends_at` hold that day's Manila start and end, and the UI hides the times. |
| `status` | `scheduled` \| `cancelled` | |
| `registration_enabled` | boolean | |
| `registration_opens_at`, `registration_closes_at` | timestamptz? | A null open time means open now. A null close time means open until the event **ends**, so walk-ins can register during an ongoing event. Set a close time to stop registration earlier. |
| `capacity` | integer? | If null, there is no limit. Lowering it below the current number of registered people is allowed. Nobody is bumped, and the overview shows "Over capacity by N". |
| `created_by` | FK → users, `set null` | |

Indexes: `starts_at`, `category_id`, `status`.

### 4.3 `event_attendance`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | |
| `event_id` | FK → events, **`restrict`** | The database itself refuses to delete an event that has attendance (§7.5). |
| `member_id` | FK → members, `cascade` | Matches `attendance.member_id`. |
| `checked_in_at` | timestamptz, default now | |
| `recorded_by` | FK → users, `set null` | |

Constraints: **unique `(event_id, member_id)`**. Because the key leads with
`event_id`, it also serves the per-event counts and lists, which the services
table needs a separate index for. Other indexes: `member_id`, for member
history, and `recorded_by`, because deleting a staff user nulls it.

There is no link to the registration row. "Registered and arrived" is the
join on `(event_id, member_id)`, so a walk-in is simply an attendance row
without a matching registration.

### 4.4 `event_fees`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | |
| `event_id` | FK, `cascade` | |
| `label` | text | "Early bird", "Regular", "Child (4–12)". Unique per event. |
| `amount_centavos` | integer, ≥ 0 | 0 is valid, e.g. "Pastor (free)". |
| `available_until` | timestamptz? | For an early-bird cutoff. After this time the tier is not offered for new registrations. |
| `active` | boolean | Inactive tiers are hidden from new registrations but kept for existing ones. |
| `sort_order` | integer | |

An event with registration enabled and **no fee rows at all** is **free**.
An event that has fee rows, none of which is currently offered (all expired
or inactive), is **not** free. Registration is refused with "No fee tier is
currently offered" until staff add or extend a tier.

### 4.5 `event_registrations`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | |
| `event_id` | FK, `cascade` | Deleting the event is blocked when any payment exists (§7.5), so cascading only removes registrations without money history. |
| `member_id` | FK → members, `restrict` | A member with registrations or payments cannot be hard-deleted. Staff mark them inactive instead. |
| `fee_id` | FK → event_fees, `restrict`, nullable | Null for a free event. Must belong to the same event, which the action checks. |
| `charge_centavos` | integer ≥ 0 | The current charge. It starts as a snapshot of the fee's amount (§3.3), and every change to it is logged in the history table below. |
| `retained_centavos` | integer ≥ 0, default 0 | Set when cancelling: the non-refundable part kept. It cannot exceed the charge. It is used only while the status is `cancelled`. |
| `status` | `registered` \| `waitlisted` \| `cancelled` | |
| `registered_at` | timestamptz | |
| `registered_by` | FK → users, `set null` | |
| `cancelled_at`, `cancelled_by`, `cancel_reason` | ? | |
| `notes` | text? | Dietary needs, a t-shirt size, and so on. Custom registration fields are §12. |

Constraints: **unique `(event_id, member_id)`**. Re-registering after a
cancellation reactivates the same row rather than inserting a new one, so the
payment history stays attached. Indexes cover `event_id`, `member_id`,
`status`, and `fee_id`.

#### Charge history: `event_registration_charge_changes`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | |
| `registration_id` | FK, `restrict` | |
| `kind` | `fee_change` \| `adjustment` | |
| `old_fee_id`, `new_fee_id` | FK → event_fees, `set null`, nullable | Filled in for `fee_change`. |
| `old_charge_centavos`, `new_charge_centavos` | integer | |
| `reason` | text | Required for both kinds. |
| `changed_by` | FK → users, `set null` | |
| `changed_at` | timestamptz | |

This table is append-only. The registration row and its history row are
written in the same transaction. The registration detail page shows the
history under the payment ledger. Any history row also makes the event
undeletable, just as payments do.

### 4.6 `event_payments`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | |
| `registration_id` | FK, `restrict` | A registration with any payment, voided or not, cannot be deleted, only cancelled. |
| `amount_centavos` | integer ≠ 0 | Positive is a **payment** and negative is a **refund**. The sign is fixed by which action wrote the row (§6), never by the submitted value. |
| `submission_id` | text, **unique** | An idempotency key: a UUID rendered into the form as a hidden input. A retried or double-clicked submit hits `ON CONFLICT DO NOTHING` and returns the existing row, so it never creates a second ledger entry. |
| `method` | `cash` \| `gcash` \| `bank_transfer` \| `other` | |
| `reference` | text? | GCash or bank reference number. Required for `gcash` and `bank_transfer`. |
| `paid_at` | timestamptz | When the money changed hands. Defaults to now and can be backdated. |
| `received_by` | FK → users, `set null` | |
| `notes` | text? | |
| `voided_at`, `voided_by`, `void_reason` | ? | Set once and never cleared. |
| `created_at` | timestamptz | This table has no `updated_at`, because rows are never updated apart from the one-time void. |

Indexes cover `registration_id` and `paid_at`.

### 4.7 `event_program_items`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | |
| `event_id` | FK, `cascade` | |
| `starts_at` | timestamptz | Must fall on the event's Manila day. It may be before `events.starts_at`, e.g. "7:00 Volunteers' call time". |
| `ends_at` | timestamptz? | At least `starts_at`. |
| `title` | text | |
| `kind` | `worship` \| `talk` \| `meal` \| `activity` \| `break` \| `logistics` \| `other` | Drives only the icon and a facet. |
| `speaker_member_id` | FK → members, `set null`, nullable | |
| `speaker_name` | text? | For an external speaker. Displayed when `speaker_member_id` is null. |
| `location`, `notes` | text? | Location defaults to the event location in the UI. |

The index is `(event_id, starts_at)`. Items are ordered by `starts_at` and
then `id`.

### 4.8 `event_tasks`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | |
| `event_id` | FK, `cascade` | |
| `title` | text | |
| `description` | text? | |
| `team` | text? | Free text, e.g. "Logistics", "Food", or "Program". It is used as a facet and group heading. |
| `due_on` | **date** | A `"YYYY-MM-DD"` string, formatted with `formatDate`. Optional. There is **no lower bound**, because planning happens before the event. The upper bound is the event's Manila day plus 14 days, for wrap-up such as thank-you notes and liquidation. |
| `assignee_member_id` | FK → members, `set null`, nullable | Committee heads are members. They do not need a staff login. |
| `milestone` | boolean | Shown on the event overview and the planning timeline. |
| `status` | `todo` \| `doing` \| `done` | |
| `completed_at`, `completed_by` | ? | Set when the task moves to `done` and cleared when it moves back. |
| `sort_order` | integer | Orders tasks within the same due date. |

Indexes are `(event_id, due_on)` and `assignee_member_id`.

### 4.9 Relations and types

Add Drizzle `relations` for every foreign key above, and inferred types
`Event`, `EventCategory`, `EventAttendance`, `EventFee`,
`EventRegistration`, `EventRegistrationChargeChange`, `EventPayment`,
`EventProgramItem`, and `EventTask`. Enum arrays and labels go in
`lib/constants.ts`: `EVENT_STATUSES`, `REGISTRATION_STATUSES`,
`PAYMENT_METHODS`, `PROGRAM_ITEM_KINDS`, `TASK_STATUSES`, and
`EVENT_CATEGORY_COLORS`. Each is kept in sync with the schema and the
validators.

## 5. Derived logic (pure, in `lib/`, unit-tested)

| Module | Exports |
| --- | --- |
| `lib/manila-time.ts` | `parseManilaDateTime("2026-12-12T09:00") → Date`, `toManilaDateTimeInput(Date)`, `parseManilaDate("2026-12-12", "start"\|"end")`, `manilaDayKey(Date) → "YYYY-MM-DD"`, `sameManilaDay(a, b)`. |
| `lib/money.ts` | `parsePesos("1,500.50") → 150050 \| null`, `formatPeso(150050) → "₱1,500.50"`, `sumCentavos`. |
| `lib/events.ts` | `eventPhase(event, now) → "upcoming"\|"ongoing"\|"past"\|"cancelled"`; `registrationState(event, fees, registeredCount, now) → "disabled"\|"cancelled"\|"not_open"\|"open"\|"full"\|"no_fee_offered"\|"closed"`, where "full" means new registrations go to the waitlist and are not refused; `offeredFees(fees, now)`; `defaultFee(fees, now)`, which is the cheapest offered fee; `formatEventWhen(event)`, which prints "Sat, 12 Dec 2026 · 8:00 AM – 5:00 PM", or "Sat, 12 Dec 2026" when all-day. |
| `lib/check-in-target.ts` | `CheckInTarget = { kind: "service" \| "event"; id: string }`; `parseCheckInTarget(searchParams)`, which reads `?service=` (unchanged) or `?event=`; `checkInTargetHref(target)`; and `mergeScanTargets(services, events, now)`, which extends `lib/scan-selection.ts` so the picker shows one time-ordered list with the nearest target preselected. |
| `lib/event-payments.ts` | `effectiveAmountDue(registration, eventStatus)`, following the table in §3.3; `settle(registration, eventStatus, payments) → { effective, paid, outstanding, refundDue }`, which ignores voided payments; `paymentStatus(settlement) → "free"\|"unpaid"\|"partial"\|"paid"\|"refund_due"`; `eventFinanceSummary(settlements) → { charged, collected, outstanding, refundsDue }`, which **sums per-registration figures** and never nets amounts across people. |
| `lib/event-program.ts` | `programConflicts(items)` lists overlapping items, which the UI shows as a warning and does not block. |
| `lib/event-tasks.ts` | `taskBucket(task, eventStartsAt, now) → "overdue"\|"this_week"\|"later"\|"no_date"\|"done"`; `weeksBeforeEvent(dueOn, eventStartsAt)`, which gives the "T-4 wks" label; `shiftTasksForCopy(sourceTasks, sourceStart, targetStart)`, which keeps each task's offset from the event start. |

## 6. Authorization

Add an `events` module to `lib/permissions.ts`. The migration inserts the
permission rows and grants, following `docs/authorization.md`.

| Key | Admin | Leader | Usher | Covers |
| --- | --- | --- | --- | --- |
| `events.view` | ✓ | ✓ | ✓ | Every `/events` page, read-only, including the finance summary. |
| `events.create` | ✓ | ✓ | | Create events. |
| `events.update` | ✓ | ✓ | | Edit the event, fees, program, and tasks; cancel or uncancel the event; **override capacity** when promoting from the waitlist. |
| `events.delete` | ✓ | | | Delete an event (§7.5 guards). |
| `events.manage_categories` | ✓ | | | `/events/categories`. |
| `events.register` | ✓ | ✓ | ✓ | Register members and create visitors inline, **choosing a fee tier only at registration**, promote from the waitlist while there is room, and cancel with no retained amount. |
| `events.adjust_amount` | ✓ | ✓ | | Anything that changes a charge after registration: change a registration's fee tier, adjust the charge, and set a retained amount when cancelling. |
| `events.record_payment` | ✓ | ✓ | ✓ | `recordPayment`, which accepts **positive amounts only**. |
| `events.void_payment` | ✓ | | | `voidPayment` and `recordRefund`, which **writes negative amounts only**. |

**Check-in keeps the existing keys.** `attendance.view` opens `/scan`, and
`attendance.record` checks someone in, whether the target is a service or an
event. The same door staff do both, and a separate key would only let the
two drift apart. Seeing an event's attendance list needs `events.view`.

Ushers staff the registration desk, so they can register people and take
payments, but they cannot change a charge, keep a cancellation fee, refund,
or void. The server enforces this and the UI only reflects it:

- `recordPayment` parses the amount as a positive number and refuses zero or
  a negative value. `recordRefund` takes a positive amount from the form and
  stores its negation. No action accepts a signed amount, so a crafted form
  cannot turn a payment into a refund.
- A posted `override=1` on promotion expresses intent. The action honours it
  only when the user also has `events.update`.
- Every page calls `requirePermission` before reading. Every action calls it
  for **its own** key, and controls render only when `hasPermission` is true.
- **Every action scopes by event.** Each registration, fee, program item,
  task, and payment id is loaded with `WHERE id = $1 AND event_id = $2`,
  or joined to its registration's event, where `$2` is the event in the URL.
  A mismatch is treated as not found. For example, a fee id from another
  event cannot be attached to this event's registration.

## 7. Behaviour rules

### 7.1 Seats: one locking protocol

Every action that can change how many people are `registered`, or the limit
itself, follows the same protocol. Those actions are `registerMember`,
`reactivateRegistration`, `promoteFromWaitlist`, `cancelRegistration`,
`updateEvent` when it changes `capacity`, and `setEventCancelled`.

1. Open a transaction and `SELECT … FROM events WHERE id = $1 FOR UPDATE`.
   This serialises every seat change for that event.
2. Re-read what the decision depends on inside the lock: the registered
   count, capacity, window, event status, and the target registration's
   status. Never trust values read before the lock.
3. Decide and write, then commit.

Outcomes:

- **Register or reactivate** creates the row as `registered` when there is
  room and as `waitlisted` when full, and the action says which.
- **Promote** is refused when full, unless the user has `events.update` and
  posted `override=1` (§6).
- **Cancelling** a registration frees a seat. It does **not** auto-promote
  anyone. The waitlist is managed by hand, and the overview shows "1 seat
  free · 3 waitlisted".
- **Lowering capacity** below the registered count is allowed. It bumps
  nobody (§4.2).

### 7.2 Registration window and fees

- Registering is refused, in the action as well as in the UI, when
  `registrationState` is `disabled`, `cancelled`, `not_open`, `closed`, or
  `no_fee_offered`. When it is `full`, registration is allowed and goes to
  the waitlist. By default registration stays open until the event **ends**,
  for walk-ins (§4.2).
- At registration, staff with `events.register` choose from
  `offeredFees(now)`, and the charge is snapshotted. Changing the tier
  afterwards is a charge change: it needs `events.adjust_amount` and a
  reason, and it writes a history row.
- **Disabling registration** only stops new registrations. If registrations
  exist, the Registrations tab, the ledgers, the finance stats, and payment
  and refund recording all stay available.

### 7.3 Payments, cancellation, and refunds

- `recordPayment` accepts positive amounts only, and `recordRefund` stores
  negative amounts only (§6). A `gcash` or `bank_transfer` entry requires
  `reference`. Each form carries a `submission_id`, so retries are no-ops.
- Payments can be recorded for any registration status. A waitlisted
  person's deposit and late money after cancellation are both real
  situations. §3.3's table decides whether that money counts as outstanding
  or as refund due.
- **Cancelling a registration** keeps its charge, its payments, and its
  history. Cancelling with **retained ₱0** needs only `events.register`.
  Retaining any amount is a charge decision, so it needs
  `events.adjust_amount` and a reason. The registration then shows
  "Refund due ₱X" until refunds bring `refund_due` to 0.
- **Cancelling an event** sets every effective amount due to 0 (§3.3), so the
  overview shows the total refunds due and a per-person list. Uncancelling
  restores the effective amounts, and ledgers never change.

### 7.4 Check-in

Phase 1 changes `/scan` and `app/(app)/scan/actions.ts`:

- **Picking a target.** The picker lists services, as today, and scheduled
  events in the same time window, merged into one list by time. Events are
  labelled with their category badge. `?service=<id>` keeps working, and
  `?event=<id>` is new. The event overview's "Open check-in" button links to
  it.
- **One action, two tables.** `recordAttendance` takes a `CheckInTarget`. It
  resolves the member exactly as today, including the
  reactivate-inactive-member prompt, and then inserts into `attendance` or
  `event_attendance`. Both use `onConflictDoNothing()` and treat an empty
  `returning()` as "already checked in". The face (#16) and name-search (#18)
  check-in work passes the same target, so it needs no event-specific code.
- **A cancelled event refuses check-in** with "This event was cancelled".
  This is enforced in the action, so it also covers `?event=` deep links and
  scanners left open when the event was cancelled. Hiding cancelled events
  from the picker is only the UI half.
- **Nothing else blocks check-in.** Walk-ins, people who are not registered,
  and people with an unpaid balance are all checked in. In phase 6, the
  result for an event with registration adds "Not registered" or
  "Balance ₱500", which staff can act on.

### 7.5 Deleting an event

Delete is refused if **any** of these exist: an `event_attendance` row (the
foreign key also enforces this), any payment row (**including voided ones**),
or any charge-history row. Otherwise the event is deleted and its fees,
registrations, program items, and tasks cascade. The normal path is **cancel**, not delete, and the
refusal message says so.

### 7.6 Program and planning

- Program items must fall on the event's Manila day. Overlapping items only
  produce a warning.
- Task due dates have no lower bound and an upper bound of the event's day
  plus 14 days (§4.8).
- **Copying the checklist** from a past event inserts its tasks as `todo`,
  unassigned, with due dates shifted by `shiftTasksForCopy`. Existing tasks
  are not affected. It can run more than once, and it is not deduplicated
  (staff delete what they do not need).

## 8. UI

**Storybook comes first for every component**, with deterministic fixtures,
both themes, and the relevant states, per `AGENTS.md`. Existing patterns are
reused: `PageHeader`, `DataTable`, `DetailList`, `StatCard`, `EmptyState`,
`BackLink`, `TableCard`, `Field`, `FormSelect`, `DatePicker`, `Dialog`, and
`Badge`.

### 8.1 Routes

```
/events                                   list (DataTable)
/events/new                               create
/events/categories                        manage categories
/events/[id]                              Overview tab
/events/[id]/edit                         edit details, registration settings
/events/[id]/registrations                Registrations tab (DataTable)
/events/[id]/registrations/new            find member / add visitor → register
/events/[id]/registrations/[regId]        registration detail + payment ledger
/events/[id]/attendance                   Attendance tab (DataTable)
/events/[id]/program                      Program tab (run of show)
/events/[id]/program/new                  add item
/events/[id]/program/[itemId]/edit        edit item
/events/[id]/tasks                        Planning tab (checklist)
/events/[id]/tasks/new                    add task
/events/[id]/tasks/[taskId]/edit          edit task
```

Forms are pages, following the house pattern for create and edit. Small
confirmations, such as voiding a payment, cancelling a registration, or
copying a checklist, are `Dialog`s over a server-action `<form>`.

### 8.2 Event shell

`app/(app)/events/[id]/layout.tsx` renders the event header once: name,
category badge, phase badge, date range, and location. Below it is a
**`SectionTabs`** row with Overview · Registrations · Attendance · Program ·
Planning. The
Registrations tab is hidden only when registration is disabled **and** no
registrations exist (§7.2). `SectionTabs` is a
new pattern made of **links**, not Base UI `Tabs`. Each tab is a URL, so it
is server-rendered, linkable, and safe with the back button. The active tab
is marked with `aria-current="page"`. Cell group and member pages can adopt
it later.

### 8.3 Pages

- **`/events`** is a `DataTable` with the columns name, category, when,
  location, registered/capacity, outstanding, and refunds due. Its facets are category and
  phase (upcoming · ongoing · past · cancelled). Sort keys are `starts` (the
  default, upcoming first) and `name`, with `id` as the tie-break.
  `emptyFiltered` has no action.
- **Overview** shows stat cards for registered/capacity (with the waitlist
  count and any "over capacity" note), charged, collected, outstanding,
  refunds due (shown when greater than 0), and tasks done/total with
  the overdue count, and checked in (for an event with registration,
  "18 checked in · 15 of 20 registered"). The header has an **"Open
  check-in"** button linking to `/scan?event=<id>`, shown with
  `attendance.view` for a scheduled event. Below the stats are a **next
  milestones** list, a `DetailList` of the details, and the fee tiers table
  with inline add/edit/deactivate for `events.update`.
- **Registrations** is a `DataTable` with the columns name, fee, charge,
  effective amount due, paid, outstanding / refund due, payment status,
  registration status, and registered on.
  Facets are registration status, payment status, and fee. Search is by
  member name. Header actions are "Register someone" and "Export CSV", which
  is the #26 pattern.
- **Register someone** has a `MemberPicker` combobox that searches members,
  shows "Already registered" inline, and offers **"Add as visitor"**, which
  reveals minimal visitor fields (first name, last name, contact number). The
  page also has the fee choice with the amount shown, and notes. On success
  it goes to the registration detail so a payment can be taken immediately.
- **Registration detail** shows the member (linked), status, fee, charge,
  and effective amount due, with change-fee and adjust-charge controls for
  `events.adjust_amount`. It shows the **charge history** and a **payment
  ledger** with voided rows struck through and labelled, their reason shown,
  and refunds labelled. It also shows outstanding or refund due and a
  **Record payment** form (amount, which defaults to the outstanding amount;
  method; reference; paid at; a hidden `submission_id`). A **Record refund**
  form (defaulting to the refund due) appears for `events.void_payment`,
  alongside the cancel (with a retained amount), reactivate, and promote
  actions.
- **Attendance** is a `DataTable` with the columns name, checked in at,
  recorded by, and (when the event has registration) a registered or walk-in
  badge. Facets are registered or walk-in. For an event with registration, a
  second view `?show=absent` lists registered people who have not checked
  in. Search is by member name.
- **Program** is a vertical **`Timeline`** for the event's day. Each item
  shows time, kind icon, title, speaker, and location, with an overlap
  warning where items clash. The page includes a
  "Print run of show" link, which gives a print stylesheet version of the
  same page.
- **Planning** is a checklist grouped by bucket: overdue, this week, later,
  no date, and done (collapsed). Each row shows its "T-3 wks" label, team,
  assignee, and a milestone flag. The status toggle is a one-button
  server-action form. The page has a team facet and a "Copy checklist from…"
  dialog listing past events.

### 8.4 New components

| Component | Location | Stories must show |
| --- | --- | --- |
| `SectionTabs` | `components/patterns/` | default, active tab, a hidden tab, narrow overflow scroll |
| `Timeline` | `components/patterns/` | several items, a single item, empty, an item with an overlap warning, and the print layout |
| `MemberPicker` | `components/form/` | empty, typing, results, no results, "already registered" rows, disabled, and the error wired through `Field`. Search is an injected async function, so stories use fixtures. |
| `MoneyInput` | `components/form/` | default, a prefilled balance, an invalid amount |
| `EventCategoryBadge` | `components/events/` | every colour × both themes |
| `EventPhaseBadge`, `PaymentStatusBadge`, `RegistrationStatusBadge` | `components/events/` | every value |
| `EventForm` | `components/events/` | create, edit, all-day, registration on/off, errors, pending |
| `FeeTiersCard` | `components/events/` | free event, several tiers, an expired early bird, read-only |
| Scan target picker (extends the existing `/scan` picker in `components/scan/`) | `components/scan/` | services only, services and events mixed, an event preselected via `?event=`, a cancelled-event refusal result, and the "already checked in" result. The existing scanner has no story, so this adds the missing coverage. |
| `RegisterForm` | `components/events/` | an existing member, the visitor path, no fees offered, full (waitlist notice) |
| `PaymentLedger` + `RecordPaymentForm` + `RecordRefundForm` | `components/events/` | unpaid, partial, paid, refund due, a voided row, a refund, a GCash reference error, a read-only (usher) view without refund or void |
| `ChargeHistory` | `components/events/` | no changes, a fee change, an adjustment |
| `CancelRegistrationDialog` | `components/events/` | with no payments, with a refund due, the retained-amount field shown or hidden by permission |
| `ProgramItemForm` | `components/events/` | internal speaker, external speaker, out-of-range error |
| `TaskChecklist` + `TaskForm` | `components/events/` | every bucket, a milestone, empty, read-only |
| `CopyChecklistDialog` | `components/events/` | a list of events, none available |

### 8.5 Colour

Category colours are the token **names** `chart-1`…`chart-5`, which exist in
`:root` and `.dark`. Runtime styles read the raw `var(--chart-n)`, per
`AGENTS.md`. Status badges use the existing `success`, `warning`, `info`, and
`destructive` tokens. Nothing uses the Tailwind palette, so
`tests/ui/design-tokens.test.ts` stays green.

### 8.6 Outside `/events`

- **Sidebar**: an "Events" item, gated on `events.view`, placed after
  Services.
- **`/scan`**: events appear in the target picker (§7.4).
- **`/members/[id]`**: an "Events" card listing the member's registrations
  with their balance, and event check-ins added to the attendance history
  with an "Event" label (phase 6).
- **Dashboard**: an "Upcoming events" card (phase 6).

## 9. Testing

- **Unit** (`bun test lib`): every function in §5, including Manila
  day-boundary cases at 23:30 and 00:30, all-day events, target parsing with
  both or neither parameter, a fee cutoff that
  is exactly now, refunds, all-voided ledgers, and task shifting across a
  month end.
- **Validators** (`lib/validators.test.ts`): `eventSchema`, `feeSchema`,
  `registrationSchema`, `visitorSchema`, `paymentSchema`,
  `programItemSchema`, and `taskSchema`. Empty strings become null, and
  the cross-field rules are covered: end ≥ start, reference required for
  GCash, a reason required for every charge change, and a retained amount
  no greater than the charge.
- **UI** (`bun run test:ui`): the component stories in §8.4 rendered with
  `composeStories`, covering interaction states and accessible names.
- **Integration** (`bun run test:integration`): every acceptance test in
  §9.1 that touches the database, plus the permission guard on every action
  and an event appearing in the `/scan` target list.
- **E2E** (`bun run test:e2e`): an admin creates a one-day conference, adds
  two fee tiers, registers a member and a new visitor, records a partial
  GCash payment, and sees the outstanding balance on the overview. They then
  use "Open check-in", check the visitor in at `/scan?event=`, and see the
  visitor on the Attendance tab as registered.

### 9.1 Acceptance tests

Each of these is written as a test **before** the phase that owns it is
built. The phase is not done until they pass. "U" means a unit test, "I" an
integration test, and "E" an E2E test.

**Money (phases 2–3)**

| # | Given → when → then | Level |
| --- | --- | --- |
| A1 | A ₱1,500 charge with ₱500 paid → the registration is cancelled with retained ₱0 → outstanding ₱0, refund due ₱500, and the charge still reads ₱1,500. | U, I |
| A2 | The same, but cancelled with retained ₱300 by a user with `events.adjust_amount` → refund due ₱200. The same request from an usher is refused. | I |
| A3 | A waitlisted registration with a ₱500 deposit → refund due ₱500 and outstanding ₱0. After promotion → outstanding ₱1,000. | U, I |
| A4 | An event with 3 registrations is cancelled → every effective amount due is 0, the overview's refunds due equal total paid, and uncancelling restores the outstanding amounts. | U, I |
| A5 | Person X owes ₱1,000 and person Y overpaid ₱1,000 → the event shows outstanding ₱1,000 **and** refunds due ₱1,000, not ₱0 net. | U |
| A6 | An usher posts `recordPayment` with amount `-500` → it is refused and no row is written. | I |
| A7 | An usher posts `recordRefund` → refused on permission. An admin posts it with 500 → the row is stored as −50000 centavos. | I |
| A8 | The same `recordPayment` form is submitted twice with one `submission_id` → exactly one ledger row, and both responses succeed. | I |
| A9 | A payment is voided → the balance is recomputed. Voiding it again → "already voided" and it stays one void. | I |
| A10 | Changing a fee tier's price → existing charges are unchanged. Changing a registration's tier as an usher → refused. As a leader, with a reason → the charge changes and one history row records the old and new values. | I |
| A11 | Every tier on an event has expired → registration is refused with "No fee tier is currently offered". An event with no tier rows → registration succeeds at ₱0. | U, I |

**Seats (phase 2)**

| # | Given → when → then | Level |
| --- | --- | --- |
| S1 | One seat left, two `registerMember` calls in parallel → exactly one `registered` and one `waitlisted`. | I |
| S2 | Full, one `reactivateRegistration` and one `registerMember` in parallel → at most `capacity` registered. | I |
| S3 | Full → an usher promotes with `override=1` → refused. A leader does the same → promoted and over capacity by 1. | I |
| S4 | Capacity is lowered below the registered count → saved, nobody's status changes, and the overview shows "over capacity". | I |
| S5 | A registration is cancelled with a waitlist → nobody is promoted automatically. | I |

**Scoping (every phase)**

| # | Given → when → then | Level |
| --- | --- | --- |
| C1 | A fee id, registration id, program item id, or task id belonging to event B is posted to an event A action → not found, and nothing is written. | I |

**Check-in (phase 1)**

| # | Given → when → then | Level |
| --- | --- | --- |
| K1 | A member is checked in to an event, then scanned again → exactly one `event_attendance` row, and the second result says "already checked in". | I |
| K2 | The event is cancelled → check-in is refused, including through a `?event=` deep link and from a scanner opened before the cancellation. Uncancelled → it succeeds. | I, E |
| K3 | Checking in to an event → no `attendance` row is written, and the dashboard's 7-day check-in count and the service attendance lists are unchanged. | I |
| K4 | A member with no registration checks in to an event with registration → recorded, and listed as a walk-in on the Attendance tab. | I |
| K5 | The same member checks in to a service and to an event at the same time → one row in each table, and neither blocks the other. | I |

**Lifecycle (phases 1–3, 5)**

| # | Given → when → then | Level |
| --- | --- | --- |
| L1 | The only payment on an event is voided → event delete is still refused. | I |
| L2 | No attendance, payments, or charge history → delete succeeds, and the fees, registrations, program, and tasks go with it. | I |
| L3 | Registration is disabled after registrations exist → the tab, ledgers, and payment recording remain, and new registrations are refused. | I, E |
| L4 | Registration close time is null → registering during an ongoing event succeeds, and after the event ends it is refused. | U, I |
| L5 | A task due 60 days before the event → accepted. A task due 15 days after the event → refused. | U |
| L6 | An event with one check-in → delete is refused. | I |
| L7 | An event whose end is on a different Manila day from its start → refused by the validator. So is an end before the start. | U |

## 10. Delivery

There are six PRs. The dependencies are:

```
1 core ──┬── 2 registration ── 3 payments ──┐
         ├── 4 program ─────────────────────┼── 6 polish
         └── 5 planning ────────────────────┘
```

Phase 1 ships the shared `MemberPicker` and `MoneyInput`, so phases 2, 4, and
5 depend only on phase 1 and can be built in any order. Phase 3 needs
phase 2.

1. **Events core**: categories, events, event attendance and check-in from
   `/scan` (§7.4), the shell and tabs, the list, and the shared
   `MemberPicker` and `MoneyInput`.
2. **Registration and fees**: fee tiers, registrations, charge history,
   inline visitors, and capacity/waitlist under the seat protocol.
3. **Payments**: ledger, record/void/refund, balances, finance stats, and
   CSV.
4. **Program timeline**: program items and the run-of-show timeline with
   print.
5. **Planning**: the task checklist, milestones, and copying from a past
   event.
6. **Integration polish**: `/scan` registration hints, the member events card
   and history, the dashboard card, and retiring `special_event` services.

## 11. Decisions made on the user's behalf

These can be changed in review. Each is marked in the text above.

1. Registrants are always members. New people become `visitor` members
   (§3.2).
2. Ushers can register people and take payments, but cannot change amounts
   or void (§6).
3. Over-capacity registrations go to the waitlist automatically. Promotion
   is manual (§7.1). Only users with `events.update` can override capacity.
4. Task assignees are members, not staff users (§4.8).
5. Payments are recorded only. There is no online payment gateway (§1).
6. Events are single-day in v1, enforced by the validator only (§3.1, §4.2).
7. Event check-in uses the existing `attendance.view` and `attendance.record`
   keys rather than new event-specific ones (§6).
8. The system categories are Conference, Training, Outreach, Fellowship,
   Celebration, Baptism, and Other. Their names are editable (§4.1).

## 12. Candidate follow-ups (not planned)

- Multi-day events, via `event_sessions` inside the events module (§3.1).
- Expenses and a budget per event, which together with fees give a net
  result.
- Custom registration fields per event (t-shirt size, allergies), as typed
  `event_registration_fields` plus answers.
- Volunteer roles and rosters (`event_roles`, `event_volunteers`).
- Audience targeting by cell-group network, feeding the absentee reports
  (#24).
- A printable or shareable receipt per payment.
- Reusing `MemberPicker`, `SectionTabs`, and `Timeline` in cell groups and
  members.
