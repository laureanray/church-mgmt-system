# Testing

## Assessment and approach

The original setup had 17 Vitest tests in two files covering cell graphs and
cell-group validators. There was no integration suite, browser suite, coverage
report, or CI workflow. Keep three distinct layers:

| Layer | Runner | What belongs here |
| --- | --- | --- |
| Unit | Vitest, Node | Pure validators, graph rules, date formatting and transformations |
| Integration | Vitest + real Postgres | Actions and database helpers, constraints, transactions, deletion behavior |
| End-to-end | Playwright + production Next.js | Real sign-in, role protection, forms, navigation and persisted results |

Next.js's bundled testing guide recommends browser tests for async Server
Components. Don't attempt to render these in Vitest. Add React Testing Library
and a separate jsdom project when client components need isolated interaction
tests; the current foundation intentionally doesn't install unused DOM tooling.

## Local commands

```bash
pnpm install
pnpm test                      # fast unit suite; no Docker or env needed
pnpm test:watch
pnpm test:coverage              # HTML in coverage/index.html; lib/ only
pnpm test:db:up                 # dedicated, disposable Postgres via Docker
pnpm test:integration           # applies committed Drizzle migrations
pnpm exec playwright install chromium  # once, and after browser upgrades
pnpm test:e2e                  # migrates/seeds, builds and starts Next on 3100
pnpm test:all                  # all three suites sequentially; start test DB first
pnpm test:db:down               # removes the disposable database
```

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
No arbitrary global coverage threshold is enforced yet.

## CI and next priorities

GitHub Actions installs locked dependencies, checks types and lint, runs unit
coverage and Postgres integration tests, installs Chromium and runs the E2E
suite. Reports, screenshots and failure traces are retained for seven days.
No Supabase or production secrets are required.

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
