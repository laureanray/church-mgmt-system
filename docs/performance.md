# Performance

A page in this app renders in 10–20ms of its own work. What makes it feel slow
is everything around that: the trip from a phone in the Philippines to the
functions in Singapore, and each *sequential* round trip a request makes once
it gets there. So the rules below are almost all about round trips, not about
rendering.

## Where a request's time goes

In order, for a click on a sidebar link in production:

1. **Browser → `sin1`.** One trip across the region. Unavoidable per request —
   which is why the best request is the one the router never makes (below).
2. **`proxy.ts`** verifies the session. Local work when Supabase signs tokens
   with an asymmetric key; an HTTPS call to Supabase Auth when it still uses
   the legacy shared secret. `lib/supabase/verify.ts` logs a warning once per
   process in production if it sees an HS256 token — if that appears in the
   Vercel logs, rotate to an asymmetric key under Project Settings → JWT Keys.
3. **`requireUser()`** — one query: profile, role and permissions together.
   Memoised per request, so the layout, the page and the action share it.
4. **The page's own queries**, which should be one `Promise.all` batch.
5. **Streaming back.** `app/(app)/loading.tsx` shows a skeleton the moment the
   click lands, so steps 1–4 are spent on a visible loading state rather than a
   frozen page.

## What the router does for you

Configured in `next.config.ts`:

- **Visited pages are reused for 30 seconds** (`staleTimes.dynamic`). Going back
  to a list you just left makes no request at all.
- **Sidebar links prefetch the whole page on intent** — pointer over, focus, or
  touch — via `IntentLink` (`components/patterns/intent-link.tsx`), and that
  prefetch is reused for 60 seconds (`staleTimes.static`). The hover-to-click
  gap pays for the round trip.
- **Your own writes always show.** Every server action ends in `revalidatePath`
  or `redirect`, and either purges these caches. Only another staff member's
  change can appear late, by at most the window above.

Both behaviours exist only in a production build; `next dev` renders every
navigation fresh.

## Checklist for a new page

- **One batch of queries after auth.** `await requirePermission(…)`, then a
  single `Promise.all`. A second `await db…` after the first is a second trip.
  If a query needs another's result, do it in SQL — a join, a subquery, or
  `db.$count` as a column — not in a second round trip.
- **Select the columns you render**, especially on lists. The RSC payload for a
  client navigation carries every value a Server Component touched.
- **Bound every list** with `LIMIT`. Tables go through `DataTable`, whose page
  size already does this; a dropdown or a dashboard card needs its own limit.
- **Keep side work off the critical path** when the page does not read its
  result. `after()` from `next/server` runs it once the response is sent. The
  occurrence top-up on `/services` and `/scan` stays inline on purpose: the
  page shows what it inserts, and `/scan` must have today's service.
- **Heavy client code is lazy.** A camera, a graph or a chart goes behind
  `next/dynamic` or a dynamic `import()` in the one component that needs it,
  as `components/scan/scanner-panel.tsx` does for the QR scanner — never into
  a shared layout, where every page pays for it.
- **Primary navigation uses `IntentLink`.** Ordinary in-content links stay
  `<Link>`; their default prefetch of the loading skeleton is enough, and full
  prefetching every link in a table would render every row's page.
- **Measure it** (below) before and after, and put the numbers in the PR.

## Measuring

```bash
bun run build && PORT=3999 bun run start
bun run perf:probe                  # every sidebar route
bun run perf:probe /members/new     # or the routes you touched
```

`scripts/perf-probe.ts` signs in as the seeded admin and reports, per route, the
median server time, the page-load HTML, the RSC payload of a client navigation,
and the gzipped JavaScript the page loads. It measures against the local stack,
so it isolates the app's own work from the network — compare runs with each
other, not with production.

Baseline on the local stack (2026-09-25):

| Route | Server | HTML | Nav RSC | JS (gzip) |
| --- | --- | --- | --- | --- |
| `/dashboard` | 17ms | 80KB | 21KB | 295KB |
| `/scan` | 13ms | 55KB | 4KB | 312KB |
| `/members` | 15ms | 118KB | 36KB | 295KB |
| `/cell-groups` | 13ms | 82KB | 8KB | 314KB |
| `/services` | 14ms | 111KB | 35KB | 298KB |
| `/users` | 14ms | 103KB | 31KB | 310KB |
| `/roles` | 10ms | 103KB | 31KB | 296KB |
| `/settings` | 9ms | 68KB | 11KB | 295KB |

About 140KB of the JavaScript is React and the Next runtime, and most of the
rest is Base UI; a new page should add little on top. A server time well above
these, or JavaScript growing by tens of KB, is worth explaining in the PR.

## The next step: Cache Components

Next 16's Cache Components (`cacheComponents: true`) would serve every route's
shell from a prerender and stream only the data, and `unstable_instant`
validates at build time that a navigation never blocks. It is not enabled
here: the `(app)` layout authenticates before rendering anything, so adopting
it means moving that check behind a Suspense boundary and auditing every
route. Worth doing as its own piece of work; until then, the rules above are
what keeps a page fast.
