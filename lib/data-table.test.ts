import { describe, expect, test } from "bun:test";

import {
  ALL_FILTER_VALUE,
  DEFAULT_PER_PAGE,
  allowedValues,
  clearNarrowingPatch,
  filterDiffersFromDefault,
  overRunPage,
  MAX_PER_PAGE,
  hasActiveFilters,
  isNarrowed,
  pageCount,
  paginationRange,
  preservedParams,
  rowRange,
  sortDirectionFor,
  sortPatch,
  tableContext,
  tableHref,
  tableOffset,
  toggleFilterValue,
  type RawSearchParams,
} from "./data-table";

const OPTIONS = {
  sortKeys: ["name", "year"] as const,
  filterKeys: ["gender", "status"] as const,
  defaultSort: "name",
  defaultDirection: "asc" as const,
};

function ctx(params: RawSearchParams = {}, overrides = {}) {
  return tableContext("/members", params, { ...OPTIONS, ...overrides });
}

describe("tableContext", () => {
  test("falls back to the table's own defaults when the URL is bare", () => {
    const { state } = ctx();

    expect(state).toMatchObject({
      query: "",
      sort: "name",
      direction: "asc",
      page: 1,
      perPage: DEFAULT_PER_PAGE,
      hidden: null,
    });
    expect(state.filters).toEqual({ gender: [], status: [] });
  });

  // The sort key picks the ORDER BY column, so an unmapped one would either
  // throw in the page or silently sort by nothing.
  test("ignores a sort key the page cannot translate to SQL", () => {
    expect(ctx({ sort: "password" }).state.sort).toBe("name");
    expect(ctx({ sort: "year" }).state.sort).toBe("year");
  });

  test("ignores a direction that is neither asc nor desc", () => {
    expect(ctx({ sort: "year", dir: "sideways" }).state.direction).toBe("asc");
    expect(ctx({ sort: "year", dir: "desc" }).state.direction).toBe("desc");
  });

  test("clamps a hand-edited page size instead of trusting it", () => {
    expect(ctx({ per: "50" }).state.perPage).toBe(50);
    expect(ctx({ per: "1000000" }).state.perPage).toBe(MAX_PER_PAGE);
    expect(ctx({ per: "0" }).state.perPage).toBe(DEFAULT_PER_PAGE);
    expect(ctx({ per: "abc" }).state.perPage).toBe(DEFAULT_PER_PAGE);
    expect(ctx({ page: "-3" }).state.page).toBe(1);
  });

  test("reads a facet from repeated params and from a comma list alike", () => {
    expect(ctx({ gender: ["male", "female"] }).state.filters.gender).toEqual([
      "male",
      "female",
    ]);
    expect(ctx({ gender: "male,female" }).state.filters.gender).toEqual([
      "male",
      "female",
    ]);
  });

  // `hidden: null` means "the URL said nothing", which is what lets a column
  // marked defaultHidden stay hidden until someone actually toggles a column.
  test("distinguishes an absent hide list from an empty one", () => {
    expect(ctx({}).state.hidden).toBeNull();
    expect(ctx({ hide: "" }).state.hidden).toEqual([]);
    expect(ctx({ hide: "gender,contact" }).state.hidden).toEqual([
      "gender",
      "contact",
    ]);
  });

  test("namespaces every parameter under a prefix", () => {
    const { state } = tableContext(
      "/members/1",
      { att_sort: "date", att_page: "3", sort: "name" },
      { prefix: "att", sortKeys: ["date"], defaultSort: "date" },
    );

    expect(state.sort).toBe("date");
    expect(state.page).toBe(3);
  });
});

describe("tableHref", () => {
  test("omits every value that is already the default", () => {
    expect(tableHref(ctx())).toBe("/members");
    expect(tableHref(ctx(), { sort: "name", direction: "asc" })).toBe("/members");
    expect(tableHref(ctx(), { page: 1 })).toBe("/members");
  });

  test("spells out a non-default sort as a column and direction pair", () => {
    expect(tableHref(ctx(), { sort: "year", direction: "desc" })).toBe(
      "/members?sort=year&dir=desc",
    );
  });

  test("keeps parameters this table does not own", () => {
    const href = tableHref(ctx({ tab: "archive", sort: "year", dir: "desc" }), {
      page: 3,
    });

    expect(href).toBe("/members?tab=archive&sort=year&dir=desc&page=3");
  });

  // Sorting a list while standing on page 7 otherwise lands on a page that no
  // longer exists, and an empty table reads as a bug rather than as the end.
  test("returns to the first page whenever the row set changes", () => {
    const on7 = ctx({ page: "7" });

    expect(tableHref(on7, { sort: "year", direction: "desc" })).not.toContain(
      "page=7",
    );
    expect(tableHref(on7, { query: "santos" })).toBe("/members?q=santos");
    expect(tableHref(on7, { filters: { gender: ["male"] } })).toBe(
      "/members?gender=male",
    );
    expect(tableHref(on7, { perPage: 50 })).toBe("/members?per=50");
  });

  test("keeps the page when only paging or hiding a column", () => {
    const on7 = ctx({ page: "7" });

    expect(tableHref(on7, { page: 8 })).toBe("/members?page=8");
    expect(tableHref(on7, { hidden: ["gender"] })).toBe(
      "/members?page=7&hide=gender",
    );
  });

  test("drops a facet when its last value is toggled off", () => {
    const filtered = ctx({ gender: "male" });

    expect(tableHref(filtered, { filters: { gender: [] } })).toBe("/members");
  });

  test("emits an empty hide list, which is not the same as no hide list", () => {
    expect(tableHref(ctx(), { hidden: [] })).toBe("/members?hide=");
    expect(tableHref(ctx({ hide: "gender" }), { hidden: null })).toBe("/members");
  });

  test("namespaces the parameters it writes", () => {
    const scoped = tableContext(
      "/members/1",
      { q: "unrelated" },
      { prefix: "att", sortKeys: ["date"] },
    );

    expect(tableHref(scoped, { page: 2 })).toBe(
      "/members/1?q=unrelated&att_page=2",
    );
  });
});

describe("preservedParams", () => {
  // A GET form replaces the whole query string rather than merging into it, so
  // anything not re-emitted as a hidden input is silently dropped on search.
  test("re-emits everything except the query and the page", () => {
    const inputs = preservedParams(
      ctx({ q: "old", page: "4", sort: "year", gender: ["male", "female"] }),
    );

    expect(inputs).toEqual([
      { name: "sort", value: "year" },
      { name: "gender", value: "male" },
      { name: "gender", value: "female" },
    ]);
  });
});

describe("sortPatch", () => {
  test("cycles a column through its two directions and back to the default", () => {
    const unsorted = ctx({ sort: "year", dir: "asc" }).state;
    expect(sortPatch(unsorted, "name")).toEqual({
      sort: "name",
      direction: "asc",
    });

    const ascending = ctx({ sort: "name", dir: "asc" }).state;
    expect(sortPatch(ascending, "name")).toEqual({
      sort: "name",
      direction: "desc",
    });

    const descending = ctx({ sort: "name", dir: "desc" }).state;
    expect(sortPatch(descending, "name")).toEqual({
      sort: "name",
      direction: "asc",
    });
  });

  test("honours a column that reads newest-first", () => {
    const state = ctx({ sort: "name" }).state;

    expect(sortPatch(state, "year", "desc")).toEqual({
      sort: "year",
      direction: "desc",
    });
  });

  test("reports which column carries the current sort", () => {
    const state = ctx({ sort: "year", dir: "desc" }).state;

    expect(sortDirectionFor(state, "year")).toBe("desc");
    expect(sortDirectionFor(state, "name")).toBeNull();
  });
});

describe("filters", () => {
  test("toggling adds a value and removes it again", () => {
    expect(toggleFilterValue([], "male")).toEqual(["male"]);
    expect(toggleFilterValue(["male", "female"], "male")).toEqual(["female"]);
  });

  test("narrowing covers a search as well as a facet", () => {
    expect(isNarrowed(ctx().state)).toBe(false);
    expect(isNarrowed(ctx({ q: "santos" }).state)).toBe(true);
    expect(isNarrowed(ctx({ gender: "male" }).state)).toBe(true);
    expect(hasActiveFilters(ctx({ q: "santos" }).state)).toBe(false);
  });
});

describe("paging arithmetic", () => {
  test("counts pages, and never fewer than one", () => {
    expect(pageCount(0, 20)).toBe(1);
    expect(pageCount(20, 20)).toBe(1);
    expect(pageCount(21, 20)).toBe(2);
  });

  test("offsets from the page number", () => {
    expect(tableOffset(ctx({ page: "3" }).state)).toBe(40);
  });

  // A bookmark to page 9 of a list that has since shrunk should show the last
  // page of rows, not an empty table.
  test("clamps an over-run page to the last one that has rows", () => {
    expect(tableOffset(ctx({ page: "9" }).state, 45)).toBe(40);
  });

  test("describes the visible slice", () => {
    expect(rowRange(1, 20, 248)).toEqual({ from: 1, to: 20 });
    expect(rowRange(13, 20, 248)).toEqual({ from: 241, to: 248 });
    expect(rowRange(1, 20, 0)).toEqual({ from: 0, to: 0 });
  });
});

describe("paginationRange", () => {
  test("lists every page while they fit", () => {
    expect(paginationRange(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(paginationRange(1, 1)).toEqual([1]);
  });

  // Constant slot count: the control must not change width as you page.
  test("elides the far side and keeps the first and last reachable", () => {
    expect(paginationRange(1, 20)).toEqual([1, 2, 3, 4, 5, "ellipsis", 20]);
    expect(paginationRange(10, 20)).toEqual([
      1,
      "ellipsis",
      9,
      10,
      11,
      "ellipsis",
      20,
    ]);
    expect(paginationRange(20, 20)).toEqual([
      1,
      "ellipsis",
      16,
      17,
      18,
      19,
      20,
    ]);
  });

  test("holds its width across every page of a long list", () => {
    const widths = new Set(
      Array.from({ length: 20 }, (_, i) => paginationRange(i + 1, 20).length),
    );

    expect([...widths]).toEqual([7]);
  });
});

describe("overRunPage", () => {
  test("points a stale bookmark at the last page that has rows", () => {
    expect(overRunPage(ctx({ page: "9" }).state, 45)).toBe(3);
    expect(overRunPage(ctx({ page: "2" }).state, 45)).toBeNull();
    expect(overRunPage(ctx().state, 0)).toBeNull();
  });
});

describe("allowedValues", () => {
  // Facet values arrive from the URL, where anything can be typed.
  test("drops values the schema does not know", () => {
    expect(allowedValues(["male", "martian"], ["male", "female"])).toEqual([
      "male",
    ]);
  });
});

describe("clearNarrowingPatch", () => {
  test("clears the search and every facet but leaves the sort alone", () => {
    const narrowed = ctx({ q: "santos", gender: "male", sort: "year", dir: "desc" });

    expect(tableHref(narrowed, clearNarrowingPatch(narrowed.state))).toBe(
      "/members?sort=year&dir=desc",
    );
  });
});

describe("facet defaults", () => {
  const withDefault = (params: RawSearchParams = {}) =>
    ctx(params, { filterDefaults: { status: ["active", "visitor"] } });

  test("an unmentioned facet holds its default selection", () => {
    const { state } = withDefault();
    expect(state.filters.status).toEqual(["active", "visitor"]);
    expect(state.filters.gender).toEqual([]);
    expect(state.defaults.filters.status).toEqual(["active", "visitor"]);
  });

  test("a value in the URL replaces the default rather than adding to it", () => {
    expect(withDefault({ status: "inactive" }).state.filters.status).toEqual([
      "inactive",
    ]);
  });

  test("the all value lifts the filter, even alongside other values", () => {
    expect(withDefault({ status: "all" }).state.filters.status).toEqual([]);
    expect(
      withDefault({ status: ["inactive", "all"] }).state.filters.status,
    ).toEqual([]);
  });

  test("leaves a default selection out of the URL, in any order", () => {
    const table = withDefault({ q: "santos" });
    expect(tableHref(table, { sort: "year" })).toBe(
      "/members?q=santos&sort=year&dir=asc",
    );
    expect(
      tableHref(table, { filters: { status: ["visitor", "active"] } }),
    ).toBe("/members?q=santos");
  });

  test("spells an emptied defaulted facet as all, and a plain one as nothing", () => {
    const table = withDefault();
    expect(tableHref(table, { filters: { status: [] } })).toBe(
      "/members?status=all",
    );
    expect(tableHref(table, { filters: { gender: [] } })).toBe("/members");
  });

  test("toggling from the default builds on what is shown", () => {
    const table = withDefault();
    const next = toggleFilterValue(table.state.filters.status, "inactive");
    expect(tableHref(table, { filters: { status: next } })).toBe(
      "/members?status=active&status=visitor&status=inactive",
    );
  });

  test("the default view is not a narrowing, but moving off it is", () => {
    expect(isNarrowed(withDefault().state)).toBe(false);
    expect(hasActiveFilters(withDefault().state)).toBe(false);
    expect(isNarrowed(withDefault({ status: "all" }).state)).toBe(true);
    expect(isNarrowed(withDefault({ status: "inactive" }).state)).toBe(true);
    expect(filterDiffersFromDefault(withDefault().state, "status")).toBe(false);
    expect(
      filterDiffersFromDefault(withDefault({ status: "all" }).state, "status"),
    ).toBe(true);
  });

  test("clearing returns a defaulted facet to its default, not to all", () => {
    const table = withDefault({ q: "santos", status: "all", gender: "male" });
    expect(tableHref(table, clearNarrowingPatch(table.state))).toBe("/members");
  });

  test("the all value is spelled once", () => {
    expect(ALL_FILTER_VALUE).toBe("all");
  });
});
