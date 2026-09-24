<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

> Everything below is project-specific. Keep it outside the marked block above,
> which the `next` package may rewrite on upgrade.

# IRM Ministries — church management

A members directory with attendance recorded against each service. Staff sign
in with their **email** and receive module permissions through a
database-backed role. Filipino church context — expect Taglish domain terms in
the schema and `en-PH` formatting throughout.

Stack: Next.js 16 App Router (route protection lives in `proxy.ts`, the
successor to `middleware.ts`) · React 19 · Drizzle ORM on Supabase Postgres ·
Supabase Auth · Tailwind 4 · shadcn/ui **Base UI** variant · zod v4 ·
`bun test`. **Bun is the package manager, task runner and test runner** — there
is no pnpm/npm lockfile, and every command in this file is `bun …`.

## shadcn here is the Base UI variant

`components.json` sets `"style": "base-nova"`, so `components/ui/*` wraps
`@base-ui/react`, not Radix. Four differences bite:

- Composition uses **`render`**, not `asChild` —
  `<SidebarMenuButton render={<Link href="/x" />}>`.
- `Select` takes `name` (so its value lands in `FormData`) and `items` (so the
  trigger can render a label instead of the raw value). `FormSelect` in
  `components/form/form-select.tsx` wires this up; use it for selects in forms.
- `CardHeader` is a **grid**, and only opens a second column for a child with
  `data-slot="card-action"`. Trailing header content therefore goes in
  `CardAction`. `<CardHeader className="flex-row justify-between">` reads as
  correct and does nothing — `flex-row` sets a direction on an element that is
  not a flex container — so the content silently wraps under the title.
- There is no shadcn `form.tsx`, so no `<Form>` / `<FormField>` primitives.

## Design system

Three layers: **tokens** in `app/globals.css`, **primitives** in
`components/ui/*` (Base UI, above), **patterns** in `components/patterns/*`.
`docs/design-system.md` is the full account; the rules that matter while editing:

- **Build UI in Storybook first.** Before building or changing a screen, inspect
  the Storybook catalog and reuse the shared components it documents. Application
  code imports the component implementation, never a story or its sample data.
- **If a needed component does not exist, create it and its colocated
  `*.stories.tsx` before integrating it into a screen.** Put primitives in
  `components/ui/`, reusable compositions in `components/patterns/`, and
  domain-specific components in the relevant feature directory. If an existing
  component has no story, add its missing coverage as part of the work. Extend
  an existing component when appropriate instead of creating a competing copy.
- **Every component must be accounted for in Storybook.** Document its purpose
  and supported variants, and demonstrate the relevant default, loading, empty,
  error, disabled, and interactive states. Build interactions with deterministic
  sample data first; wire server actions and real data after the UI is established.
  Stories must remain usable without a database, credentials, or external services.
- **Follow the selected Register design throughout.** Use the shared fonts in
  `lib/fonts.ts` (IBM Plex Sans), burgundy brand tokens, neutral surfaces, the
  shared radius scale, compact rows, and restrained decoration. Colors,
  typography, borders, focus states, and corners must use the design system;
  do not introduce a local palette, font, or competing component style.
  Add any genuinely new token to the shared system and document its purpose.
- **Verify the component in Storybook before considering UI work complete.**
  Check both light and dark themes, narrow and wide layouts, and applicable
  keyboard and pointer interactions. Update the affected stories and design-system
  documentation alongside implementation changes, and run the relevant UI checks
  and Storybook build. A successful build alone does not verify the rendered UI.
- **Colour comes from a token, never from Tailwind's palette.** `text-warning`,
  not `text-amber-600 dark:text-amber-400`; a palette utility opts out of the
  theme and its dark variant is an unchecked guess.
  `tests/ui/design-tokens.test.ts` fails the build on one, hex literals
  included.
- Adding a colour means adding it to `:root` **and** `.dark`, then mapping it in
  `@theme inline`.
- Before hand-rolling a placeholder, a stat card, a bordered table or a back
  link, check `components/patterns/` — each of those already exists there, and
  each was extracted from several near-identical copies.
- **Every table is `DataTable`.** `components/ui/table.tsx` is the primitive it
  is built from, and nothing else imports it. See the section below.
- `Field` wires `aria-describedby` and `aria-invalid` onto the control it wraps,
  which is what makes a server-action error visibly red. It derives ids from
  `htmlFor`, so pass one on every field. A custom control must forward both
  props, as `FormSelect` does — otherwise the clone lands on a component that
  drops them.
- Reading a token at runtime (an SVG `fill`, an inline style) means the **raw**
  `--chart-1`, not the `--color-chart-1` alias: `@theme inline` only emits an
  alias the bundler saw spelled out, and the Next and Storybook builds disagree
  about which ones that is.
- Every component gets a `*.stories.tsx` beside it, and every story is checked
  in **both** themes — the toolbar switch is right there. Story args stay
  JSON-serializable, so React elements *and* component references (`icon: Users`)
  are built in `render` instead; `tests/ui/story-args.test.ts` enforces it.

`bun run storybook` serves it on :6006, `bun run storybook:network` does the
same over your tailnet (for checking a component on a real phone), and
`bun run build-storybook` is what CI builds.

## Tables are `DataTable`, and their state is the URL

`components/patterns/data-table/` renders every table in the app. Its state —
search, sort, page, page size, facets, hidden columns — lives entirely in the
query string, parsed and rebuilt by `lib/data-table.ts`:

```
/members?q=santos&sort=since&dir=desc&page=2&per=50&gender=male&hide=contact
```

That is what keeps it renderable from a Server Component: a sort is a `<Link>`,
a page is a `<Link>`, a search is a GET form, so `cell` returns ordinary server
JSX and no row data reaches the browser. The **page** does the work — it reads
`ctx.state`, turns it into `WHERE`, `ORDER BY` and `LIMIT`, and hands back one
page of rows plus the matching total. `DataTable` sorts and filters nothing
itself; `app/(app)/members/page.tsx` is the reference.

Four things there are load-bearing, not stylistic:

- `?sort=` picks the `ORDER BY` column, so the page passes a `sortKeys`
  whitelist and `tableContext` drops anything outside it.
- Every `orderBy` ends with the row id. A `LIMIT`/`OFFSET` walk over a
  non-unique column repeats or skips rows between pages.
- Facet values come from the URL, so they go through `allowedValues` before
  they reach a typed enum column.
- `overRunPage` + `redirect` handles a bookmark to a page that no longer
  exists; without it a stale link shows an empty table that reads as a bug.

Every control except two is an anchor or a GET form in the server's HTML. The
exceptions are the facet menu and the column picker: a menu needs JavaScript to
open regardless, and a real `menuitemcheckbox` announces "checked" where a link
with a tick drawn on it does not. Page size is *not* one of them — it is a
single-select navigation between four fixed URLs, so it is four links.

That is about the URL being the whole model — linkable, back-button-safe,
prefetchable, and no table state to hydrate — and **not** a no-JavaScript
guarantee. `app/(app)/loading.tsx` puts every route in the group behind a
streaming Suspense boundary, and React reveals streamed content with an inline
script, so a scripting-disabled browser sits on the skeleton however the table
is built.

`emptyFiltered` is separate from `empty` and deliberately cannot carry an
action: someone whose *search* missed is one click from creating a duplicate of
the record they were looking for.

## Forms are server actions over FormData

There is no form library. Every form follows one shape — `service-form.tsx` plus
`app/(app)/services/actions.ts` is the reference pair:

1. A `"use server"` action in the route's `actions.ts`, typed
   `(prev: XFormState, formData: FormData) => Promise<XFormState>`.
2. The action calls `requirePermission("module.action")` first, then parses `FormData` with a
   zod schema from `lib/validators.ts`, returning
   `{ errors: fieldErrors(parsed.error), message }` when parsing fails.
3. On success: mutate, `revalidatePath()` each affected route, then `redirect()`.
4. The client component drives it with `useActionState(action, undefined)` and
   wraps each input in `<Field label htmlFor error>` from `components/form/field.tsx`.

Validators normalise empty strings to `null` (`emptyToNull`), so optional
columns stay nullable rather than filling with `""`.

## Auth

**Supabase Auth** is the identity provider; staff sign in with **email** and
password. Supabase owns credentials — this codebase never hashes a password.

- `lib/auth-helpers.ts` exports `requireUser()` and `requirePermission(key)`, both
  of which redirect. Call one at the top of **every** page and
  `requirePermission` at the top of **every** server action: `proxy.ts` only checks
  that a session exists, so permission enforcement is per-route. `requireUser()` is wrapped in React `cache()`, so calling it from
  the layout *and* the page *and* an action costs one check per request — call
  it freely rather than threading the user through props.
- Tokens are verified by `verifiedUserId()` in `lib/supabase/verify.ts`, not by
  `getUser()`. It takes the access token from `getSession()` — which decodes
  the cookie and refreshes it when stale, and proves nothing on its own — then
  checks the signature against the project's JWKS. That is a local computation,
  where `getUser()` was an HTTPS call to Supabase on every request. The JWKS
  cache lives on a client instance, so `verify.ts` keeps a second, session-less
  client alive for the process; the per-request clients in `server.ts` cannot
  hold it. On a project still using the legacy shared signing secret this falls
  back to `getUser()` internally — correct either way, but only faster once the
  project moves to asymmetric signing keys. Never swap either of these for a
  bare `getSession()`, which does not verify at all.
- The `users` table is a **profile**, not a credential store. Its `id` *is* the
  `auth.users` UUID, and `requireUser()` joins it to `roles` and
  `role_permissions` — Supabase for identity, these tables for authorization. A
  signed-in user with no profile row or valid role is rejected. See
  `docs/authorization.md` before adding a module or permission.
- Three Supabase clients, and picking the wrong one is a security bug:
  `lib/supabase/server.ts` (session-bound, for pages and actions),
  `lib/supabase/client.ts` (browser), and `lib/supabase/admin.ts` (service
  role — bypasses everything, so only after the relevant `users.*` permission).
  The
  verifier in `lib/supabase/verify.ts` is a fourth, but it is anonymous and
  read-only — it holds no session and can reach no data.
- Creating or deleting staff writes to **both** Supabase Auth and the profile
  table; `app/(app)/users/actions.ts` rolls the auth user back if the profile
  insert fails, so neither half is left orphaned.
- Authorization is by permission key, never by role name. Gate a page with
  `requirePermission`, and use `hasPermission` / `hasAnyPermission` to decide
  what the UI shows. Keys are registered in `lib/permissions.ts` and seeded by a
  migration, and they are persisted, so never rename one casually.

Two config traps in `supabase/config.toml`:

- `[auth] enable_signup = false` is what closes public registration. Leave
  `[auth.email] enable_signup = true` — that flag gates the email provider as a
  whole, so turning it off breaks **sign-in** with `email_provider_disabled`.
- `minimum_password_length` must stay in step with `changePasswordSchema` in
  `lib/validators.ts`, or the form accepts a password Supabase then rejects.

## Data

Postgres on Supabase, reached **only through Drizzle** — no `supabase-js` query
ever touches application data, and there are no RLS policies, so a missing
`requirePermission` is a real hole rather than a second line of defence. Storage,
Realtime and PostgREST stay switched off in `supabase/config.toml`; the API
gateway and Auth are on solely because Supabase Auth signs staff in.

Two connection strings, because they are not interchangeable:

- `DATABASE_URL` — the app. In production this is the **transaction pooler**
  (port 6543), which cannot hold prepared statements, so `db/index.ts` turns
  them off when it sees that port.
- `DIRECT_URL` — drizzle-kit only. Migrations run DDL, which the transaction
  pooler does not support, so this must be a direct or session-pooler
  connection (port 5432).

On Vercel these fall back to `POSTGRES_URL` and `POSTGRES_URL_NON_POOLING`,
which the Supabase integration injects. Prefer that fallback over copying the
URLs into `DATABASE_URL`/`DIRECT_URL`: the integration rotates those credentials,
and copies go stale silently.

`vercel.json` pins functions to `sin1`, because the Supabase project is in
Singapore (`ap-southeast-1`). Vercel's default is `iad1` in Washington, D.C.,
which put roughly 230ms of Pacific between the app and its database — paid once
per query, and pages issue several in sequence. **If the Supabase project ever
moves region, move this with it**; a mismatch here costs more than every other
optimisation in this file combined. Middleware is unaffected either way, since
`proxy.ts` runs at whichever edge location the request arrives at.

Column types worth knowing before you query:

- Date-only fields (`birthdate`, `weddingAnniversary`, `spiritualBirthday`) are
  `date`, which Drizzle hands back as a `"YYYY-MM-DD"` **string**, not a `Date`.
  Render them with `formatDate`, which parses at local noon to dodge timezone
  rollover.
- Timestamps are `timestamp({ withTimezone: true })` and surface as `Date`.
- Enums are text columns constrained only in TypeScript — there are no
  Postgres `ENUM` types. Adding a value means editing `db/schema.ts`,
  `lib/constants.ts` and `lib/validators.ts` together.

Migrations are versioned and committed: `bun run db:generate`, then
`bun run db:migrate`. `scripts/vercel-build.mjs` applies them on Vercel
**production** deploys only (previews skip). Supabase's own migration runner is
disabled so that `db/migrations` stays the single schema history; `db:push`
would desync it, so reach for generate + migrate instead.

## Performance

Pages render in ~15ms of their own work; the cost users feel is round trips.
`docs/performance.md` has the checklist and the measuring tool — the rules that
matter while editing:

- After `requirePermission`, a page makes **one** `Promise.all` batch of
  queries. A second sequential `await db…` is a second trip; fold it into SQL.
- `next.config.ts` sets `staleTimes` so visited and intent-prefetched pages are
  reused briefly. Server actions must keep ending in `revalidatePath` or
  `redirect` — that is what purges those caches after a write.
- Primary navigation uses `IntentLink` (`components/patterns/`), which fully
  prefetches a page on hover, focus or touch. In-content links stay `<Link>`.
- Heavy client libraries load lazily in the one component that needs them,
  never in the shared layout.
- `bun run perf:probe` times routes against a local production build; put
  before/after numbers in PRs that add or reshape a page.

## Invariants to preserve

- Attendance is unique per `(memberId, serviceId)`. `recordAttendance` detects
  a duplicate check-in by an empty `returning()` after `onConflictDoNothing()`.
- Generated services are unique per `(scheduleId, scheduledAt)` — that
  constraint is what makes `generateForSchedule` idempotent.
- `topUpAllSchedules()` is called from the `/services` and `/scan` page loads.
  There is no cron; occurrences appear because someone opened a page.
- Editing or pausing a schedule rebuilds only *future, un-attended*
  occurrences. Past and already-attended services survive.
- `app_settings` is a single row keyed `"singleton"`; write it with
  `onConflictDoUpdate`.

## Working here

### Required branch and worktree workflow

Before making any changes for a new task, always create both a new branch and
a new Git worktree from the latest remote `main`. This applies to every kind
of change, including code, tests, documentation, configuration, dependencies,
generated files, and this `AGENTS.md`.

1. Inspect the current branch, worktrees, and working-tree status. Preserve all
   existing work; do not stash, reset, move, or overwrite unrelated changes.
2. Run `git fetch origin main`. If fetching fails, stop before editing and
   report the blocker; do not silently use a stale local `main`.
3. Create a task-specific branch and sibling worktree from `origin/main`:
   `irm new <task-branch> <task-slug>`. The helper fetches again,
   creates the worktree beside the primary checkout (even when invoked from
   another worktree) — or under `worktree_root` when the irm config sets one,
   as the remote development host does — and avoids tracking `origin/main`
   with a task branch.
   Without the manager, use `git worktree add --no-track -b <task-branch>
   <absolute-sibling-path> origin/main`.
4. Confirm the new worktree's branch and starting commit match the intended
   branch and fetched `origin/main`, then perform all edits and checks there.
5. Report the branch and worktree path when starting work and in the handoff.

Continue follow-up work for the same task in its dedicated branch/worktree;
create a fresh pair from newly fetched `origin/main` for each new task. Never
start edits in the original checkout, on `main`, or on another task's branch.
Read-only assessment may run in the existing checkout before creating a
worktree, but the worktree must exist before the first file mutation.

### Required pull request handoff

Every task that changes repository files must end with a pull request against
`main`. This includes code, tests, documentation, configuration, dependencies,
generated files, and changes to this `AGENTS.md`. After reviewing the diff and
running relevant checks, commit the intended files, push the task branch, and
open a ready-for-review PR before reporting the task complete. Keep follow-up
fixes for that task on the same branch and PR. Link each PR to the current agent
thread when that capability is available, and include its URL in the handoff.

The PR is also the handoff for background Codex Code Review. Check the PR for
a running or completed Codex review. If none appears and the repository has
Codex Code Review enabled, request one with `@codex review` and verify that the
request was registered. Report any push, PR, or review-trigger blocker clearly;
do not describe an unreviewed PR as already under Codex review. Leave merging
to the user unless they explicitly request it.

### Worktree lifecycle

The `irm` manager lives in `tools/irm/`; see its README for installation and
commands. Run `irm context` and `irm wt` before starting work. Saved selection
is independent of the shell directory: use `irm ws <branch>` then
`cd "$(irm cd)"`. Follow-ups reuse the same task's worktree. Stop managed services
before selecting a different one. `irm setup` links an ignored `.env` and installs
locked dependencies without replacing existing environment files.

Once merged, preview with `irm cleanup --dry-run`, then run `irm cleanup` in a
terminal to choose removals. Stop external servers/agents using candidates first.
Primary, selected, current, manager-source, running-service and locked worktrees
are protected. Uncommitted/untracked files and ignored local configuration block
removal. Actual HEAD ancestry is required: a merged PR can have later unmerged
commits, and squash/rebase merges need manual review. Branches are retained.
Never use force removal, automatic stashing, or branch deletion to bypass a
blocked cleanup. Lock ongoing worktrees when they should be reserved.

`irm remote` drives a Linux host over SSH: its dashboard with the app's ports
forwarded to `localhost`, and `irm remote sync` to mirror worktrees there
(uncommitted work included). Work made on the host returns through GitHub.
See the manager README.

`irm run` never changes database schema. `irm migrate` explicitly runs Drizzle
against the selected project's local Supabase only; review compatibility because
worktrees share the database. No Supabase migration runner, reset, or history
repair is used. `bun run test:irm` checks the manager and terminal renderer.

### Project conventions

- `bun test lib` (the `test` script) runs the unit suite over `lib/**/*.test.ts`.
  Put pure logic in `lib/` so it is testable there — `lib/cell-graph.ts` with
  `lib/cell-graph.test.ts` is the model. Import from `bun:test`, never
  `vitest`. A bare `bun test` would also sweep up the integration and
  Playwright specs, so always run the scoped scripts.
- Component tests live in `tests/ui/` (`bun run test:ui`) and render the
  Storybook stories themselves via `composeStories`, so the stories are the
  fixtures. happy-dom is registered only for that suite. No Docker needed.
- Integration tests live in `tests/integration/` (`bun run test:integration`);
  E2E tests live in `tests/e2e/` (`bun run test:e2e`). Both use the disposable
  test Postgres from `bun run test:db:up`, never the development database. See
  `docs/testing.md`; run these suites sequentially.
- `bunfig.toml` preloads `tests/support/bun-preload.ts`, which stubs
  `server-only` for every test run — bun has no resolver aliases, so a module
  importing `server-only` throws without it. Integration migrations come from a
  second `--preload` in the `test:integration` script, since `bun test` has no
  `globalSetup`. `mock.module` is not hoisted like `vi.mock`, so register mocks
  before `await import(…)`-ing the module under test.
- Modules reaching the database or secrets import `"server-only"`.
- `app/(app)/loading.tsx` is the whole group's loading boundary. Every route in
  it authenticates, so every route is dynamic and none can be prerendered —
  without that boundary the router holds the previous page on screen for the
  full server round trip and a click looks ignored. Adding a route-level
  `loading.tsx` to override it is fine; deleting it is not.
- `bun run dev` runs Next on the **Bun runtime** (`bunx --bun next dev`), but
  `build` and `start` deliberately stay on Node so local production builds
  match Vercel. Keep it that way when editing scripts.
- Bun executes TypeScript directly, so there is no `tsx`: `db:seed` is
  `bun db/seed.ts`, and the `.mjs` scripts run under `bun`.
- `bun run db:up` starts the local stack; `bun run db:reset` rebuilds and
  reseeds it. It binds the `544xx` port block (Postgres `54422`, Studio
  `54423`) rather than Supabase's `543xx` default, so it coexists with other
  local Supabase projects.
- Seeded admin: `admin@church.local` / `admin123`. The seed creates it through
  the Supabase Admin API, so `bun run db:seed` needs the auth stack running.
- Commits follow `type(scope): summary`, e.g. `feat(cell-groups): …`.
- CI is `.github/workflows/tests.yml`, on GitHub-hosted `ubuntu-latest`
  runners (free, since the repository is public). `infra/github-runner/` and
  `infra/shared-ci/` hold the retired AWS runner stacks; `shared-ci` still
  serves another repository, so leave it deployed.
