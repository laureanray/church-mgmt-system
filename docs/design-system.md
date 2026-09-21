# Design system

Three layers, and knowing which one a change belongs in is most of the work:

| Layer | Where | What lives there |
| --- | --- | --- |
| **Tokens** | `app/globals.css` | Every colour, radius and font in the product, as CSS custom properties |
| **Primitives** | `components/ui/*` | shadcn's **Base UI** components — Button, Badge, Card, Table, Select |
| **Patterns** | `components/patterns/*` | This app's recurring compositions — PageHeader, EmptyState, StatCard |

Storybook renders all three: `bun run storybook`.

## Tokens

`app/globals.css` holds two blocks that do different jobs:

- `:root` and `.dark` hold **raw values**. They are the only place an `oklch()`
  literal belongs.
- `@theme inline` maps each raw value onto a Tailwind utility, so a component
  writes `bg-primary` or `text-warning` and never a literal.

A component that writes `text-amber-600 dark:text-amber-400` has stepped outside
this system. It will not follow a rebrand, and its dark variant is a guess
rather than a checked contrast. `tests/ui/design-tokens.test.ts` fails the build
if one appears — including hex literals — with two deliberate exemptions:
`components/members/member-qr.tsx` prints into a popup document that has no
stylesheet, and `lib/qr.ts` must emit true black on true white or camera
scanners lose the contrast they decode from.

### The palette

The **Register** direction uses IBM Plex Sans for body text and headings,
neutral surfaces, a 2px base corner radius, and a restrained burgundy accent.
Light mode uses `oklch(0.40 0.10 15)` with light labels; dark mode lifts the
accent to `oklch(0.77 0.09 15)` with dark labels. Sidebar actions and focus
rings use the same brand colors. Chart hues remain categorical.

`lib/fonts.ts` is shared by the app layout and Storybook. Storybook places the
font variables on `<html>` so portalled menus and dialogs use the same face.
Use `font-sans` / `font-heading`, semantic color utilities, and the radius
scale; small controls use `rounded-md` rather than reading a generated
Tailwind alias at runtime. Circular avatars and switch thumbs stay circular.

Prefer thin rules, compact rows, and plain section headings. Avoid adding
extra tinted cards or decorative icon containers just to fill space. Earlier
visual studies remain under Foundations / Design Directions for comparison;
the ordinary component stories show the selected theme.

Status colours are `--success`, `--warning`, `--info` and `--destructive`. Each
is used as `text-x` over a `bg-x/10` tint — the Badge variants of the same name
do exactly that — so it is the **text** contrast that has to hold, not the
swatch.

`--chart-1` … `--chart-5` are **categorical, not sequential**: they identify
cell-group tiers, so their hues are spread and their lightness held roughly
constant. `TIER_STYLE` in `lib/cell-graph.ts` is the single source of truth for
which tier gets which, and both the SVG and the legend beside it read from it,
so a colour cannot drift between the dot in the key and the dot on the canvas.

Those fills name the **raw** `--chart-*` properties, not the `--color-chart-*`
Tailwind aliases, and anywhere else reading a variable at runtime should do the
same — see the trap under [Adding a token](#adding-a-token).

### Adding a token

Add the raw value to **both** `:root` and `.dark`, then map it in
`@theme inline`. Check it in both themes in Storybook's *Foundations → Tokens*
story — the swatches read the live variables, which is the only reliable way to
catch a token that was only ever eyeballed in light mode.

One trap when writing a story or a component that reads a variable directly:
`@theme inline` **substitutes** theme values into utilities instead of emitting
`--color-*` properties, so whether `var(--color-success)` resolves at all
depends on the bundler finding that exact name spelled out in a scanned file.
This is not hypothetical — the Next build emits every alias while the Storybook
build emitted only the handful named literally in source, from the same
stylesheet. Read the raw `--success`, which is authored in `:root` and `.dark`
and therefore always present. `lib/cell-graph.test.ts` pins this for the graph
tiers.

## Primitives

`components.json` sets `"style": "base-nova"`, so `components/ui/*` wraps
`@base-ui/react`, not Radix. The differences that actually bite are in
[AGENTS.md](../AGENTS.md); two are worth repeating because Storybook documents
them with a working example:

- Composition is **`render`**, not `asChild` — see *UI/Badge → AsLink*.
- `CardHeader` is a **grid**. Trailing header content must be a `CardAction`, or
  it drops under the title. `<CardHeader className="flex-row justify-between">`
  looks correct and does nothing, since `flex-row` sets a direction on an
  element that is not a flex container. See *UI/Card → WithAction*.

`Badge` carries the semantic variants (`success`, `warning`, `info`, `brand`)
and a `size` scale, so a status pill never has to be hand-rolled from utility
classes.

`Field` (`components/form/field.tsx`) wires the accessibility contract onto
whatever single element it wraps: `aria-describedby` pointing at the hint or
error, and `aria-invalid` while there is an error. **A custom control has to
accept and forward both**, or the clone lands on a component that discards them
— `FormSelect` takes a fixed prop list rather than spreading the rest, so it
passes them to `SelectTrigger` explicitly. That second one is not only
for screen readers — `Input` styles its error ring off `aria-invalid`, so this
is what turns a failed server-action round-trip into a visibly red field. It
derives its ids from `htmlFor`, deliberately not `useId`, so it stays renderable
from a Server Component; pass `htmlFor` on every field.

### Date entry

Use `DatePicker` from `components/form/date-picker.tsx` inside `Field` for
editable date-only values. It accepts `id`, `name`, an ISO `defaultValue`,
`required`, and `disabled`, and forwards the field’s error/description contract.
The visible input explicitly uses `DD/MM/YYYY`; a hidden input submits the
existing `YYYY-MM-DD` server-action value. Clearing submits an empty string.
Impossible dates are rejected rather than silently rolled into another month.

The shared `Calendar` wraps React DayPicker for day-grid keyboard navigation
inside a Base UI popover. Month/year selectors support birthdays without
paging through decades. Today and Clear are explicit actions; Escape returns
focus to the editable field. Both components have isolated Storybook examples,
including validation and a native FormData/reset demonstration. Datetime fields
continue to use their existing datetime control.

## Patterns

| Component | Replaces |
| --- | --- |
| `PageHeader` | Title, description and actions above every page |
| `BackLink` | The "← Back to members" ghost link, previously copied into 12 routes |
| `EmptyState` | The dashed placeholder *and* the muted line inside a Card (`variant="inline"`) |
| `StatCard` | The dashboard's headline figures |
| `InfoTile` | The icon-led attribute cards on a service |
| `DetailList` / `DetailRow` | The label/value description list on a record |
| `TableCard` | The bordered, clipped frame around a full-width table |
| `SearchField` | The list-page search box |
| `DataTable` | Every table in the app: sorting, paging, search, facets, columns |

### DataTable

`components/patterns/data-table/` is the only thing that renders a `<table>`
outside Storybook. `components/ui/table.tsx` is still the primitive underneath,
but nothing else imports it — which is the point: six pages previously
hand-rolled a header row, and they had already drifted on alignment, on which
columns dropped at which breakpoint, and on whether an empty list said anything
at all.

All of its state lives in the URL, parsed by `lib/data-table.ts`:

```
/members?q=santos&sort=since&dir=desc&page=2&per=50&gender=male&hide=contact
```

That is what keeps the whole component renderable from a Server Component. A
sort is a `<Link>`, a page is a `<Link>`, a search is a GET form — so the
*page* does the ordering and the `LIMIT`/`OFFSET` in SQL, and `cell` can return
ordinary server JSX holding a `<Link>`, an `<Avatar>` or a delete button. It
also means a narrowed table is linkable, survives a refresh and steps back
correctly.

The corollary is that **`DataTable` never sorts or filters anything itself**.
Handing it every row and hoping is how you ship a table that is correct at 50
members and wrong at 5,000.

A page wires it up in three parts — the `sortKeys` whitelist, the `WHERE`, and
the columns:

```tsx
const SORT_COLUMNS = { name: members.fullName, since: members.memberSinceYear };

const ctx = tableContext("/members", await searchParams, {
  sortKeys: Object.keys(SORT_COLUMNS),
  filterKeys: ["gender"],
  defaultSort: "name",
});
```

Four rules are load-bearing rather than stylistic:

- **Whitelist the sort keys.** `?sort=` picks the `ORDER BY` column. Anything
  outside `sortKeys` falls back to the default instead of reaching the query.
- **Give the `ORDER BY` a unique tiebreaker.** A `LIMIT`/`OFFSET` walk over a
  non-unique column can repeat or skip rows between pages; every list here ends
  its ordering with the id.
- **Narrow facet values with `allowedValues`.** They arrive from the URL and the
  enum columns are typed.
- **Redirect an over-run page** with `overRunPage`, so a bookmark to page 9 of a
  list that has since shrunk lands on the last page that has rows — and says so
  in the URL, rather than showing an empty table.

Two controls are menus rather than links: the facet filter and the column
picker. Both are multi-select, and a real `menuitemcheckbox` announces "checked"
to a screen reader where a link dressed up with a tick does not. A facet
deliberately stays open after a toggle. Everything else — sorting, paging, page
size, reset — is an anchor, and the search is a GET form.

Read that as "the URL is the whole model", not as "it runs without JavaScript".
`app/(app)/loading.tsx` puts the group behind a streaming Suspense boundary that
React reveals with an inline script, so scripting-off never gets past the
skeleton. What the anchors buy is real all the same: a control is linkable and
prefetchable, and there is no client table state to hydrate or to disagree with
the server.

Two behaviours in there are load-bearing rather than cosmetic:

- **`EmptyState` for a search that matched nothing must not offer a create
  action.** Someone whose search missed is one click from creating a duplicate
  of the record they were looking for.
- **`DetailRow` renders `value || "—"`**, so a nullable column can be passed
  straight through — but a real zero is falsy and would vanish behind the dash.
  Pass `String(0)`.
- **`DataTable` takes two empty states**, and `emptyFiltered` cannot carry an
  action for the same reason: it is what a missed *search* shows.

## Storybook

```bash
bun run storybook          # dev server on :6006
bun run storybook:network  # same, reachable from your tailnet
bun run build-storybook    # static build into storybook-static/
```

`storybook:network` is for checking a component on a real phone rather than a
desktop viewport emulator. It mirrors `dev:network`, but is shorter for a
reason worth knowing: the Next dev server has to be *told* its own address,
because the browser reads `NEXT_PUBLIC_SUPABASE_URL` and would otherwise call
back to a `localhost` that means the phone. Storybook has no backend to point
at, so it only needs to stop binding to the loopback interface.

It does set `STORYBOOK_ALLOWED_HOSTS`, which `.storybook/main.ts` turns into
`core.allowedHosts`. Binding to `0.0.0.0` listens on *every* interface — café
wifi included — and Storybook otherwise answers to any `Host` header, which is
what lets a DNS-rebinding attack reach a dev server. Naming the tailnet
addresses narrows it back. `STORYBOOK_PORT` overrides the port; note it is
deliberately not `PORT`, which `dev:network` reads.

Stories sit beside their component as `*.stories.tsx`; the foundations live in
`.storybook/foundations.stories.tsx`.

The toolbar's theme switch puts `dark` on `<html>`, not on the story wrapper —
the custom variant is `&:is(.dark *)`, which matches descendants of `.dark` and
never the element carrying it. **Check every new story in both themes**; that is
the cheapest way to catch a colour that only works in one.

Storybook builds with Vite while the app builds with Turbopack, so
`.storybook/main.ts` wires Tailwind up a second time through
`@tailwindcss/vite`. Same `app/globals.css`, same tokens — only the bundler
differs.

Args stay JSON-serializable, because Storybook round-trips them through the
manager/preview channel, the Controls panel and shareable URLs. That rules out
both React elements (which also carry a cycle through `_owner` in development,
and make Storybook log a warning) and component references such as
`icon: Users`. Build those inside the story's `render`.

Neither one crashes — the symptom is a dead control and a lossy URL — so
`tests/ui/story-args.test.ts` imports every story module and fails on one.

## Testing

See [testing.md](./testing.md#ui-tests). In short: `bun run test:ui` renders the
stories themselves through `composeStories`, so the stories are the fixtures and
cannot drift from what the tests assert.
