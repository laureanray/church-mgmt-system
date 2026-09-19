# Testing

## Assessment and approach

The original setup had 17 Vitest tests in two files covering cell graphs and
cell-group validators. There was no integration suite, browser suite, coverage
report, or CI workflow. Keep three distinct layers:

| Layer | Runner | What belongs here |
| --- | --- | --- |
| Unit | `bun test`, Bun runtime | Pure validators, graph rules, date formatting and transformations |
| UI | `bun test` + happy-dom | Presentational components, rendered from their Storybook stories |
| Integration | `bun test` + real Postgres | Actions and database helpers, constraints, transactions, deletion behavior |
| End-to-end | Playwright + production Next.js | Real sign-in, role protection, forms, navigation and persisted results |

Next.js's bundled testing guide recommends browser tests for async Server
Components. Don't attempt to render those in `bun test` — the UI layer covers
presentational components only, and anything that awaits a database belongs in
the integration or E2E suite.

### Bun test specifics

The unit and integration suites share one runner but differ in setup, and three
details do not carry over from Vitest:

- **No resolver aliases.** `bunfig.toml` preloads `tests/support/bun-preload.ts`,
  which calls `mock.module("server-only", …)` for every run. Without it, any
  module importing `server-only` (`lib/cell-graph.ts` included) throws on
  import.
- **`mock.module` is not hoisted** the way `vi.mock` was, so integration files
  register mocks first and then `await import(…)` the module under test. Keep
  that order when adding tests.
- **No `globalSetup`.** Migrations run from `tests/support/integration-setup.ts`,
  passed as `--preload` in the `test:integration` script; `bun test` runs files
  sequentially in one process, so it executes exactly once.

## UI tests

`bun run test:ui` runs `tests/ui/` against happy-dom, preloading
`tests/support/ui-setup.ts`. It is scoped to that directory on purpose: the DOM
is registered only there, so a `lib/` module that reaches for `window` still
fails in the unit suite rather than passing and then breaking on the server.

The tests render **the Storybook stories themselves**, through `composeStories`
from `@storybook/react`. The stories are the fixtures, which is what stops the
documented example and the asserted behaviour from drifting apart — a story
edited to show something new fails the test that relied on the old shape.
Project annotations from `.storybook/preview.tsx` are deliberately *not*
applied: it imports `app/globals.css`, which bun cannot parse. Assertions are
therefore about structure, roles and class names, never computed styles.

Four details of the setup are non-obvious:

- Everything after `GlobalRegistrator.register()` in `ui-setup.ts` is imported
  **dynamically**. ESM evaluates static imports before any statement in the
  file, and `@testing-library/dom` builds its `screen` object at module scope
  from `document.body`. Import it statically and it captures an undefined
  document, leaving `screen.getByRole` throwing for the whole run while
  `render(...)` still works — a confusing half-failure.
- Testing Library's `cleanup` is wired to `afterEach` explicitly. It normally
  self-registers when it detects a global `afterEach`, which it cannot under
  bun, and `bun test` shares one process across files — so without it a mounted
  component leaks into the next file.
- `tests/support/testing-library.d.ts` augments bun's `Matchers` with jest-dom's
  signatures. The package ships exactly this file as `types/bun.d.ts`, but does
  not expose that path in its `exports` map, so it cannot be referenced under
  `moduleResolution: "bundler"`.
- One project annotation *is* registered: a decorator supplying Next's
  `AppRouterContext`. Without it any story containing a component that calls
  `useRouter` — the table's facet filter and column picker — dies on "expected
  app router to be mounted". Storybook's own Next mocks are not reachable here,
  because `@storybook/nextjs-vite` pulls in `storybook/preview-api`, which bun
  cannot resolve. The stub in `tests/support/router.ts` records the pushes
  instead of navigating, so a test can assert *where* a menu click would have
  gone; `resetRouterCalls` runs in `afterEach`.

`tests/e2e/members-table.spec.ts` is where the table's two halves meet. The
unit suite pins the URLs it builds and the UI suite pins the markup it renders,
but only the browser proves that `?sort=since&dir=desc` reaches Postgres as the
right `ORDER BY` — so those specs assert on the rows that come back, not on the
query string alone.

`tests/ui/design-tokens.test.ts` is not a render test: it scans `app/`,
`components/` and `lib/` for Tailwind palette utilities and hex literals, and
fails on any colour that bypasses the design tokens. See
[design-system.md](./design-system.md).

Coverage is `bun test --coverage`, reported as text plus `coverage/lcov.info` —
there is no HTML report, and only files a test actually loads appear, so
untouched `lib/` modules are absent rather than listed at 0%.

`scripts/coverage-report.mjs` turns that `lcov.info` into markdown for CI (see
below). Two things about its totals: it aggregates hits across files
(`lines hit / lines found`), whereas bun's text reporter prints the unweighted
mean of the per-file percentages, so the two headline numbers differ slightly on
purpose. And because bun's report is silent about files no test loads, the
script walks `lib/` itself and lists the absent ones, so the percentage is not
mistaken for whole-directory coverage.

## Local commands

```bash
bun install
bun test lib                       # fast unit suite; no Docker or env needed
bun run test:watch
bun run test:ui                    # component suite via happy-dom; no Docker either
bun run test:coverage              # text + coverage/lcov.info; loaded lib/ files
bun run coverage:report            # the markdown CI posts, from the last lcov run
bun run test:db:up                 # dedicated, disposable Postgres via Docker
bun run test:integration           # applies committed Drizzle migrations
bunx playwright install chromium   # once, and after browser upgrades
bun run test:e2e                   # migrates/seeds, builds and starts Next on 3100
bun run test:all                   # all three suites sequentially; start test DB first
bun run test:db:down               # removes the disposable database
```

A bare `bun test` would pick up the integration and Playwright specs too, so
every script scopes the run to a directory. Prefer the scripts over `bun test`.

The test stack is three containers: Postgres on **54432** (separate from local
Supabase's **54422**), a **GoTrue** instance owning the `auth` schema in that
same database, and a tiny **nginx** gateway on **54433**. The gateway exists
because `supabase-js` builds its calls as `${SUPABASE_URL}/auth/v1/...` while
GoTrue serves from the root — it strips the prefix, which is the one job Kong
does in a full Supabase stack. GoTrue is given `search_path=auth`; without it,
it resolves unqualified names against `public` and finds this app's own `users`
table. Postgres runs `tests/support/init-auth-schema.sql` on first boot, since
GoTrue's migrations assume the `auth` schema already exists.

It uses tmpfs; stopping/recreating it loses its data. It does not require the
Supabase CLI. Tests never use `.env`, `DATABASE_URL`, or `DIRECT_URL` to choose
their database. `TEST_DATABASE_URL` may override the default, but must point to
localhost/127.0.0.1 and the exact database `church_mgmt_test`. Only put disposable
test data there: integration fixtures and E2E setup truncate all application
tables. Never run integration and E2E suites simultaneously against one database.

Playwright overrides the app's database and auth environment, refuses to reuse
an existing server, and signs in through **real Supabase Auth** with test-only
admin, leader and usher accounts created via the GoTrue admin API. Those live in
`auth.users`, which `resetTestDatabase` does not truncate, so the global setup
deletes any account left by a previous run before recreating it. It uses the regular `.next` production build folder;
avoid running another build in the same checkout at the same time. Browser
contexts are fresh per test; members have unique names so retries don't collide.
No development seed data or external integration credentials are needed.

## Initial coverage

- Unit: existing cell graph/validator rules plus calendar date, local datetime,
  optional meeting and initials formatting, and the cell-graph tier styling.
- UI: the design-system patterns and primitives — empty-state wording rules,
  `Field`'s error/`aria-invalid` wiring, `CardAction` placement, `DetailRow`'s
  em-dash fallback, badge status tokens, and the token guardrail scan.
- Integration: concurrent attendance deduplication, QR URL compatibility,
  invalid scans, authentication boundary, concurrent/idempotent schedule
  generation, preservation of past/attended services and paused schedules.
- E2E: anonymous redirect, invalid password, admin/leader member creation and
  persistence, restricted staff routes, usher denied member creation, mobile
  sidebar resizing, and cell graph selection/dragging.

Integration tests stub the session boundary and Next cache invalidation, but
execute the actual application functions against migrated Postgres. E2E tests
verify the real session path. Coverage currently reports unit execution only;
zero coverage on server modules does not account for integration/E2E execution.
No arbitrary global coverage threshold is enforced yet, so the pull request
report informs review rather than gating the merge.

## CI and next priorities

GitHub Actions sets up Bun from `.bun-version`, installs locked dependencies
with `bun install --frozen-lockfile`, checks types and lint, runs unit coverage
and Postgres integration tests, installs Chromium and runs the E2E suite. Reports, screenshots and failure traces are retained for seven days.
No Supabase or production secrets are required.

Workflow triggers are `pull_request` plus pushes to `main` only. A push filter
matters beyond CI minutes here: an unfiltered `push` runs the whole suite a
second time on the same commit, and the two runs compete for the same per-IP
anonymous registry pull quota, which surfaces as `toomanyrequests: Rate
exceeded` from `test:db:up`. That step also retries three times with backoff,
since the quota is shared with every other runner on the host and the failure is
transient rather than a compose problem.

Every run writes the coverage markdown to the job summary, and pull requests
additionally get it as a comment that later pushes **edit in place** rather than
append (`gh pr comment --edit-last --create-if-none`, using the built-in
`GITHUB_TOKEN`; the job therefore asks for `pull-requests: write`). The comment
step runs directly after the unit suite, so a failure further down the job still
leaves the report on the pull request. Pull requests opened from a fork are
skipped by design: their token is read-only, and attempting the comment would
fail the job.

Next useful additions are member/service validator edge cases, permission
checks on mutation actions, schedule editing/pausing through forms, password
reset flows, and singleton settings updates. Add a browser QR scan test once
the in-progress camera workflow settles; current browser tests do not exercise
camera decoding. External integrations such as Google Sheets need controlled fakes and
separate opt-in live checks, never calls to production from ordinary CI.

The CI quality job runs independently from the test job. The setup also fixes
React lint errors: graph rendering uses immutable simulation snapshots, the
mobile hook subscribes to viewport changes with useSyncExternalStore, and
request-time clock reads in authenticated async Server Components have scoped
lint exceptions. Graph nodes also retain pointer capture so clicking a node
does not immediately clear its selection. Browser regressions cover graph
selection/dragging and mobile navigation.
