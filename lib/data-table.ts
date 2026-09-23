/**
 * Table state — search, sort, page, facet filters, hidden columns — lives in
 * the URL, and this module is the only place that knows how it is spelled
 * there.
 *
 * That is what keeps `DataTable` renderable from a Server Component: a sort is
 * a `<Link>`, a page change is a `<Link>`, and a search is a GET form. The
 * server therefore does the ordering and the `LIMIT`/`OFFSET` in SQL instead of
 * shipping every row to the browser to sort it there, and a filtered table
 * stays linkable, survives a refresh, and steps back correctly.
 *
 * Everything here is pure — no React, no Drizzle, no `server-only` — so it is
 * testable in `lib/` alongside `lib/data-table.test.ts`.
 */

export type SortDirection = "asc" | "desc";

/** What Next hands a page as `searchParams`, once awaited. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

export const PER_PAGE_OPTIONS = [10, 20, 50, 100] as const;
export const DEFAULT_PER_PAGE = 20;

/**
 * A hostile `?per=100000` would ask Postgres for the whole table and then
 * render it, so the parser clamps rather than trusting the URL. The cap is
 * deliberately above the largest menu option: a hand-edited `?per=200` is a
 * legitimate thing for staff to do, `?per=1e9` is not.
 */
export const MAX_PER_PAGE = 200;

/** Query-string keys this module owns, before any prefix is applied. */
const KEYS = {
  query: "q",
  sort: "sort",
  direction: "dir",
  page: "page",
  perPage: "per",
  hidden: "hide",
} as const;

type StateKey = keyof typeof KEYS;

/**
 * The facet value that means "no filter" for a facet with defaults. Without a
 * default an empty selection already means everything, but a defaulted facet
 * reads an empty URL as its default, so showing everything needs a spelling.
 */
export const ALL_FILTER_VALUE = "all";

export type TableStateOptions = {
  /**
   * Namespace for every parameter, so two tables can share one route without
   * one's sort clobbering the other's. `prefix: "att"` reads `?att_sort=`.
   */
  prefix?: string;
  /**
   * Sort keys the page is prepared to translate into SQL. A `?sort=` outside
   * this list falls back to the default — otherwise the URL picks the ORDER BY
   * column, and an unmapped key would either throw or silently sort by nothing.
   */
  sortKeys?: readonly string[];
  /** Facet parameter names, unprefixed. Each is parsed as a repeated value. */
  filterKeys?: readonly string[];
  /**
   * The selection a facet starts with when the URL names none — the members
   * directory opening on active and visiting members only. A reader reaches
   * everything with `?facet=all` (`ALL_FILTER_VALUE`).
   */
  filterDefaults?: Record<string, readonly string[]>;
  /**
   * The values a facet accepts. Anything else in the URL is dropped before the
   * default is considered, so `?status=married` — an old bookmark, or a typo —
   * falls back to the default view instead of reading as a selection that then
   * filters to nothing and silently lifts the filter altogether.
   */
  filterValues?: Record<string, readonly string[]>;
  defaultSort?: string | null;
  defaultDirection?: SortDirection;
  defaultPerPage?: number;
};

export type TableState = {
  prefix: string;
  query: string;
  sort: string | null;
  direction: SortDirection;
  /** 1-based, as it appears in the URL. Use `tableOffset` for SQL. */
  page: number;
  perPage: number;
  /**
   * Every configured facet's effective selection, present even when nothing is
   * selected. A facet the URL does not mention holds its default here; an
   * empty array always means "no filter".
   */
  filters: Record<string, string[]>;
  /**
   * `null` means the URL said nothing, so the columns' own `defaultHidden`
   * applies. An empty array means the reader explicitly showed everything —
   * a distinction `string[]` alone cannot carry.
   */
  hidden: string[] | null;
  defaults: {
    sort: string | null;
    direction: SortDirection;
    perPage: number;
    filters: Record<string, string[]>;
  };
};

/**
 * State plus the route it came from. Plain data, deliberately: it crosses into
 * `DataTable`'s subtrees, and a method on it would be a function prop that
 * could not cross a Server/Client boundary.
 */
export type TableContext = {
  path: string;
  params: RawSearchParams;
  state: TableState;
};

export function paramName(prefix: string, key: StateKey | string): string {
  const name = key in KEYS ? KEYS[key as StateKey] : key;
  return prefix ? `${prefix}_${name}` : name;
}

function firstValue(
  params: RawSearchParams,
  key: string,
): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function allValues(params: RawSearchParams, key: string): string[] {
  const value = params[key];
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Split on commas as well as repetition, so `?hide=a,b` and `?hide=a&hide=b` agree. */
function listValues(params: RawSearchParams, key: string): string[] {
  const seen = new Set<string>();
  for (const raw of allValues(params, key)) {
    for (const part of raw.split(",")) {
      const trimmed = part.trim();
      if (trimmed) seen.add(trimmed);
    }
  }
  return [...seen];
}

function positiveInt(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Read table state out of a route's `searchParams`. */
export function tableContext(
  path: string,
  params: RawSearchParams,
  options: TableStateOptions = {},
): TableContext {
  const prefix = options.prefix ?? "";
  const defaultSort = options.defaultSort ?? null;
  const defaultDirection = options.defaultDirection ?? "asc";
  const defaultPerPage = clampPerPage(options.defaultPerPage ?? DEFAULT_PER_PAGE);
  const key = (name: StateKey | string) => paramName(prefix, name);

  const requestedSort = firstValue(params, key("sort"))?.trim() || null;
  const sort =
    requestedSort && (!options.sortKeys || options.sortKeys.includes(requestedSort))
      ? requestedSort
      : defaultSort;

  const requestedDirection = firstValue(params, key("direction"))?.trim();
  const direction: SortDirection =
    requestedDirection === "asc" || requestedDirection === "desc"
      ? requestedDirection
      : defaultDirection;

  const filters: Record<string, string[]> = {};
  const defaultFilters: Record<string, string[]> = {};
  for (const filterKey of options.filterKeys ?? []) {
    const fallback = [...(options.filterDefaults?.[filterKey] ?? [])];
    const accepted = options.filterValues?.[filterKey];
    const values = listValues(params, key(filterKey)).filter(
      (value) =>
        !accepted || value === ALL_FILTER_VALUE || accepted.includes(value),
    );
    defaultFilters[filterKey] = fallback;
    filters[filterKey] = values.includes(ALL_FILTER_VALUE)
      ? []
      : values.length
        ? values
        : fallback;
  }

  const requestedPerPage = positiveInt(firstValue(params, key("perPage")));
  const perPage = requestedPerPage === null ? null : clampPerPage(requestedPerPage);
  const hiddenKey = key("hidden");

  return {
    path,
    params,
    state: {
      prefix,
      query: firstValue(params, key("query"))?.trim() ?? "",
      sort,
      direction,
      page: positiveInt(firstValue(params, key("page"))) ?? 1,
      perPage: perPage ?? defaultPerPage,
      filters,
      hidden: hiddenKey in params ? listValues(params, hiddenKey) : null,
      defaults: {
        sort: defaultSort,
        direction: defaultDirection,
        perPage: defaultPerPage,
        filters: defaultFilters,
      },
    },
  };
}

function sameSelection(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

/** True when a facet's selection is not the one the table opens with. */
export function filterDiffersFromDefault(
  state: TableState,
  name: string,
): boolean {
  return !sameSelection(
    state.filters[name] ?? [],
    state.defaults.filters[name] ?? [],
  );
}

function clampPerPage(value: number): number {
  return Math.min(Math.max(value, 1), MAX_PER_PAGE);
}

export type TableStatePatch = {
  query?: string | null;
  sort?: string | null;
  direction?: SortDirection;
  page?: number;
  perPage?: number;
  /** Replaces a facet's whole selection. Use `toggleFilterValue` to compute it. */
  filters?: Record<string, string[]>;
  /** `null` restores the columns' own `defaultHidden`. */
  hidden?: string[] | null;
};

/**
 * Build the href for a state change, preserving every query parameter this
 * table does not own — a second table's state on the same route, or the
 * `?service=` the scan page navigates with.
 *
 * Any change other than paging returns to page 1. Sorting a filtered list
 * while standing on page 7 otherwise lands on a page that no longer exists,
 * and an empty table reads as a bug rather than as the end of the list.
 */
export function tableHref(
  ctx: TableContext,
  patch: TableStatePatch = {},
): string {
  const { state } = ctx;
  const { prefix } = state;
  const key = (name: StateKey | string) => paramName(prefix, name);

  const search = new URLSearchParams();
  const owned = new Set<string>([
    ...(Object.keys(KEYS) as StateKey[]).map(key),
    ...Object.keys(state.filters).map(key),
  ]);
  for (const [name, value] of Object.entries(ctx.params)) {
    if (owned.has(name) || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      search.append(name, item);
    }
  }

  const touchesRows = Object.keys(patch).some(
    (name) => name !== "page" && name !== "hidden",
  );
  const next = {
    query: patch.query === null ? "" : (patch.query ?? state.query),
    sort: patch.sort === undefined ? state.sort : patch.sort,
    direction: patch.direction ?? state.direction,
    page: patch.page ?? (touchesRows ? 1 : state.page),
    perPage: patch.perPage ?? state.perPage,
    filters: { ...state.filters, ...patch.filters },
    hidden: patch.hidden === undefined ? state.hidden : patch.hidden,
  };

  if (next.query) search.set(key("query"), next.query);
  // Direction is meaningless without a column, and is only worth spelling out
  // once the pair differs from the table's own default ordering.
  if (next.sort && (next.sort !== state.defaults.sort || next.direction !== state.defaults.direction)) {
    search.set(key("sort"), next.sort);
    search.set(key("direction"), next.direction);
  }
  if (next.page > 1) search.set(key("page"), String(next.page));
  if (next.perPage !== state.defaults.perPage) {
    search.set(key("perPage"), String(next.perPage));
  }
  for (const [name, values] of Object.entries(next.filters)) {
    // A default selection is left out so the canonical URL stays short, which
    // in turn means an emptied defaulted facet must say "all" explicitly.
    const fallback = state.defaults.filters[name] ?? [];
    if (sameSelection(values, fallback)) continue;
    if (values.length === 0) {
      search.append(key(name), ALL_FILTER_VALUE);
      continue;
    }
    for (const value of values) search.append(key(name), value);
  }
  if (next.hidden !== null) search.set(key("hidden"), next.hidden.join(","));

  const query = search.toString();
  return query ? `${ctx.path}?${query}` : ctx.path;
}

/**
 * Hidden inputs a GET search form must re-emit, because submitting one
 * replaces the entire query string rather than merging into it. `page` is
 * deliberately dropped: a new search starts at the first page.
 */
export function preservedParams(
  ctx: TableContext,
): { name: string; value: string }[] {
  const key = (name: StateKey) => paramName(ctx.state.prefix, name);
  const dropped = new Set([key("query"), key("page")]);
  const inputs: { name: string; value: string }[] = [];
  for (const [name, value] of Object.entries(ctx.params)) {
    if (dropped.has(name) || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      inputs.push({ name, value: item });
    }
  }
  return inputs;
}

/** The direction this column is currently sorted in, or `null` if it is not. */
export function sortDirectionFor(
  state: TableState,
  sortKey: string,
): SortDirection | null {
  return state.sort === sortKey ? state.direction : null;
}

/**
 * Where a click on a column header should go.
 *
 * Three states, not two: unsorted → the column's natural direction → the
 * reverse → back to the table's default. Without that third step a reader who
 * sorted by a column has no way back to the ordering the page opened with.
 */
export function sortPatch(
  state: TableState,
  sortKey: string,
  initialDirection: SortDirection = "asc",
): TableStatePatch {
  const current = sortDirectionFor(state, sortKey);
  if (current === null) return { sort: sortKey, direction: initialDirection };
  if (current === initialDirection) {
    return { sort: sortKey, direction: initialDirection === "asc" ? "desc" : "asc" };
  }
  return { sort: state.defaults.sort, direction: state.defaults.direction };
}

/** Add or remove one value from a facet's selection, keeping it sorted-stable. */
export function toggleFilterValue(
  current: readonly string[],
  value: string,
): string[] {
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
}

/**
 * Patch that clears the search and returns every facet to its default,
 * leaving sort and columns alone.
 */
export function clearNarrowingPatch(state: TableState): TableStatePatch {
  const filters: Record<string, string[]> = {};
  for (const name of Object.keys(state.filters)) {
    filters[name] = [...(state.defaults.filters[name] ?? [])];
  }
  return { query: null, filters };
}

/** True when any facet has been moved off its default selection. */
export function hasActiveFilters(state: TableState): boolean {
  return Object.keys(state.filters).some((name) =>
    filterDiffersFromDefault(state, name),
  );
}

/**
 * True when the reader has narrowed the rows — what distinguishes "no matches"
 * from "none yet". A facet sitting on its default is the table's own view, not
 * a narrowing, so it counts as neither.
 */
export function isNarrowed(state: TableState): boolean {
  return state.query !== "" || hasActiveFilters(state);
}

export function pageCount(total: number, perPage: number): number {
  if (total <= 0 || perPage <= 0) return 1;
  return Math.ceil(total / perPage);
}

/** SQL `OFFSET` for the current page, clamped so an over-run page asks for the last one. */
export function tableOffset(state: TableState, total?: number): number {
  const page =
    total === undefined
      ? state.page
      : Math.min(state.page, pageCount(total, state.perPage));
  return (page - 1) * state.perPage;
}

/** Inclusive 1-based row numbers on the current page, for "Showing 21–40 of 248". */
export function rowRange(
  page: number,
  perPage: number,
  total: number,
): { from: number; to: number } {
  if (total <= 0) return { from: 0, to: 0 };
  const from = Math.min((page - 1) * perPage + 1, total);
  return { from, to: Math.min(page * perPage, total) };
}

/**
 * The page to send a reader to when the URL's page has run past the end of the
 * list, or `null` when it has not.
 *
 * A bookmark to page 9 of a list that has since shrunk should land on the last
 * page that has rows. Redirecting rather than silently clamping keeps the URL
 * honest about which page is on screen.
 */
export function overRunPage(state: TableState, total: number): number | null {
  const pages = pageCount(total, state.perPage);
  return state.page > pages ? pages : null;
}

/**
 * Narrow facet values to the ones the schema knows.
 *
 * Facet values arrive from the URL, where anything can be typed. Drizzle
 * parameterises them so a stray value is harmless at the database, but the
 * enum columns are typed, and silently dropping an unknown value is better
 * than an `IN` list that can never match.
 */
export function allowedValues<T extends string>(
  values: readonly string[],
  allowed: readonly T[],
): T[] {
  return values.filter((value): value is T =>
    (allowed as readonly string[]).includes(value),
  );
}

export type PaginationSlot = number | "ellipsis";

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/**
 * Page numbers to render, with `"ellipsis"` where a run was elided. The slot
 * count is constant for a given `siblings`, so the control does not change
 * width as the reader pages through.
 */
export function paginationRange(
  page: number,
  pages: number,
  siblings = 1,
): PaginationSlot[] {
  const slots = siblings * 2 + 5;
  if (pages <= slots) return range(1, Math.max(pages, 1));

  const current = Math.min(Math.max(page, 1), pages);
  const left = Math.max(current - siblings, 1);
  const right = Math.min(current + siblings, pages);
  const leftGap = left > 2;
  const rightGap = right < pages - 1;

  if (!leftGap && rightGap) return [...range(1, slots - 2), "ellipsis", pages];
  if (leftGap && !rightGap) return [1, "ellipsis", ...range(pages - slots + 3, pages)];
  return [1, "ellipsis", ...range(left, right), "ellipsis", pages];
}
