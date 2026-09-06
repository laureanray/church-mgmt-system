# Testing

## Assessment and approach

The original setup had 17 Vitest tests in two files covering cell graphs and
cell-group validators. There was no integration suite, browser suite, coverage
report, or CI workflow. Keep three distinct layers:

| Layer | Runner | What belongs here |
| --- | --- | --- |
| Unit | `bun test`, Bun runtime | Pure validators, graph rules, date formatting and transformations |
| Integration | `bun test` + real Postgres | Actions and database helpers, constraints, transactions, deletion behavior |
| End-to-end | Playwright + production Next.js | Real sign-in, role protection, forms, navigation and persisted results |

Next.js's bundled testing guide recommends browser tests for async Server
Components. Don't attempt to render these in `bun test`. Add React Testing
Library and a separate happy-dom setup when client components need isolated
interaction tests; the current foundation intentionally doesn't install unused
DOM tooling.

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
  optional meeting and initials formatting.
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
