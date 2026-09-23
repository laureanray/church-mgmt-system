import { describe, expect, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { composeStories } from "@storybook/react";

import { routerCalls } from "@/tests/support/router";
import * as stories from "@/components/patterns/data-table/data-table.stories";

const {
  Default,
  Sorted,
  Filtered,
  NoMatches,
  Empty,
  HiddenColumns,
  LastPage,
  InsideCard,
  Compact,
  DefaultedFacet,
  DefaultedFacetShowingAll,
  DefaultedFacetNarrowed,
} = composeStories(stories);

function headers() {
  return screen
    .getAllByRole("columnheader")
    .map((cell) => cell.textContent?.trim());
}

describe("DataTable", () => {
  test("names the table for assistive tech without showing the name", () => {
    const { container } = render(<Default />);

    const caption = container.querySelector("caption");
    expect(caption).toHaveTextContent("Church members");
    expect(caption?.className).toContain("sr-only");
  });

  test("renders one row per record", () => {
    render(<Default />);

    // Five members plus the header row.
    expect(screen.getAllByRole("row")).toHaveLength(6);
    expect(screen.getByText("Ana Reyes")).toBeInTheDocument();
  });

  test("renders an em dash for a column with no value", () => {
    render(<Default />);

    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("DataTable sorting", () => {
  test("makes a sortable header a link and leaves the rest plain", () => {
    render(<Default />);

    expect(screen.getByRole("link", { name: /^Name/ })).toBeInTheDocument();
    // `contact` has no sortKey, so its header must not be clickable.
    const contact = screen
      .getAllByRole("columnheader")
      .find((cell) => cell.textContent?.trim() === "Contact");
    expect(within(contact!).queryByRole("link")).toBeNull();
  });

  // The arrow says which way the column is sorted to anyone who can see it;
  // `aria-sort` is what says it to anyone who cannot.
  test("marks the sorted column with aria-sort", () => {
    render(<Sorted />);

    const sorted = screen
      .getAllByRole("columnheader")
      .find((cell) => cell.textContent?.includes("Member Since"));
    expect(sorted).toHaveAttribute("aria-sort", "descending");

    const unsorted = screen
      .getAllByRole("columnheader")
      .find((cell) => cell.textContent?.trim().startsWith("Name"));
    expect(unsorted).toHaveAttribute("aria-sort", "none");
  });

  test("a first click sorts, and a second reverses", () => {
    render(<Default />);

    expect(screen.getByRole("link", { name: /^Gender/ })).toHaveAttribute(
      "href",
      "/members?sort=gender&dir=asc",
    );
    // Already ascending by name, so the next click on Name is descending.
    expect(screen.getByRole("link", { name: /^Name/ })).toHaveAttribute(
      "href",
      "/members?sort=name&dir=desc",
    );
  });

  test("a third click returns to the table's own ordering", () => {
    render(<Sorted />);

    expect(screen.getByRole("link", { name: /^Member Since/ })).toHaveAttribute(
      "href",
      "/members",
    );
  });

  test("carries the sort through a search, which would otherwise drop it", () => {
    const { container } = render(<Sorted />);

    // A GET form replaces the query string rather than merging into it.
    const hidden = [...container.querySelectorAll('input[type="hidden"]')].map(
      (input) => [
        input.getAttribute("name"),
        input.getAttribute("value"),
      ],
    );
    expect(hidden).toEqual([
      ["sort", "since"],
      ["dir", "desc"],
    ]);
  });
});

describe("DataTable search and facets", () => {
  test("searches through a GET form, so a result is a linkable URL", () => {
    const { container } = render(<Default />);

    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    expect(form).not.toHaveAttribute("method", "post");
    expect(
      screen.getByRole("textbox", { name: "Search members by name" }),
    ).toHaveAttribute("name", "q");
  });

  test("puts the live query back in the field", () => {
    render(<Filtered />);

    expect(screen.getByRole("textbox", { name: /search members/i })).toHaveValue(
      "re",
    );
  });

  test("counts the active facet on its trigger", () => {
    render(<Filtered />);

    expect(
      within(screen.getByRole("button", { name: /gender/i })).getByText("1"),
    ).toBeInTheDocument();
  });

  test("offers a reset back to the unnarrowed list", () => {
    render(<Filtered />);

    expect(screen.getByRole("link", { name: "Reset" })).toHaveAttribute(
      "href",
      "/members",
    );
  });

  test("hides the reset while nothing is narrowing the list", () => {
    render(<Default />);

    expect(screen.queryByRole("link", { name: "Reset" })).toBeNull();
  });
});

describe("DataTable empty states", () => {
  // Someone whose search missed is one click from creating a duplicate of the
  // record they were looking for.
  test("a search that matched nothing does not offer the create action", () => {
    render(<NoMatches />);

    expect(screen.getByText("No members match your search")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add member/i })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Clear filters" }),
    ).toHaveAttribute("href", "/members");
  });

  test("an empty collection does offer it", () => {
    render(<Empty />);

    expect(screen.getByText("No members yet")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add member/i }),
    ).toBeInTheDocument();
  });

  test("renders no table at all when there are no rows", () => {
    render(<Empty />);

    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("DataTable column visibility", () => {
  test("drops the columns named in the URL", () => {
    render(<HiddenColumns />);

    expect(headers()).toEqual(["Name", "Marital Status", "Contact"]);
  });

  test("shows every column when the URL says nothing", () => {
    render(<Default />);

    expect(headers()).toEqual([
      "Name",
      "Gender",
      "Marital Status",
      "Member Since",
      "Contact",
    ]);
  });
});

describe("DataTable pagination", () => {
  test("reports the slice on screen", () => {
    render(<Default />);

    expect(
      screen.getByText("Showing 1–20 of 248 rows"),
    ).toBeInTheDocument();
  });

  // A link that goes nowhere is still focusable and still announced as a link,
  // which leaves a screen-reader user looping at the first page.
  test("disables the ends rather than linking them to themselves", () => {
    render(<Default />);

    expect(screen.getByRole("button", { name: "First page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute(
      "href",
      "/members?page=2",
    );
  });

  test("disables the far end on the last page", () => {
    render(<LastPage />);

    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Last page" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "First page" })).toHaveAttribute(
      "href",
      "/members",
    );
  });

  test("marks the page you are on", () => {
    render(<Default />);

    expect(screen.getByRole("link", { name: "Page 1" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Page 2" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  test("keeps the search and facets when paging", () => {
    render(<Filtered />);

    expect(screen.getByRole("link", { name: "Page 1" })).toHaveAttribute(
      "href",
      "/members?q=re&gender=female",
    );
  });

  test("omits pagination entirely when no total is given", () => {
    render(<InsideCard />);

    expect(screen.queryByRole("navigation", { name: "Pagination" })).toBeNull();
  });
});

describe("DataTable framing", () => {
  test("drops its own border when it already sits inside a Card", () => {
    const { container } = render(<InsideCard />);

    expect(container.querySelector(".rounded-none")).not.toBeNull();
  });

  test("renders no toolbar when there is no state to change", () => {
    render(<InsideCard />);

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /columns/i })).toBeNull();
  });

  test("compact density tightens the cells", () => {
    const { container } = render(<Compact />);

    expect(container.querySelector("td")?.className).toContain("py-1");
  });
});

describe("DataTable menus", () => {
  // These two controls are the only ones that are not a link or a GET form:
  // opening a menu already needs JavaScript, so there is nothing left to
  // protect by refusing to use it — and a real `menuitemcheckbox` announces
  // "checked", which a link dressed up with a tick does not.
  test("a facet reports what is selected and navigates on a toggle", async () => {
    const user = userEvent.setup();
    render(<Filtered />);

    await user.click(screen.getByRole("button", { name: /gender/i }));

    const female = await screen.findByRole("menuitemcheckbox", {
      name: "Female",
    });
    expect(female).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemcheckbox", { name: "Male" })).toHaveAttribute(
      "aria-checked",
      "false",
    );

    await user.click(screen.getByRole("menuitemcheckbox", { name: "Male" }));
    // Adds to the selection rather than replacing it, and returns to page 1.
    expect(routerCalls.push).toEqual(["/members?q=re&gender=female&gender=male"]);
  });

  test("clearing a facet keeps the search", async () => {
    const user = userEvent.setup();
    render(<Filtered />);

    await user.click(screen.getByRole("button", { name: /gender/i }));
    await user.click(await screen.findByRole("menuitem", { name: /clear gender/i }));

    expect(routerCalls.push).toEqual(["/members?q=re"]);
  });

  test("the column picker toggles a column off", async () => {
    const user = userEvent.setup();
    render(<Default />);

    await user.click(screen.getByRole("button", { name: /columns/i }));

    const gender = await screen.findByRole("menuitemcheckbox", {
      name: "Gender",
    });
    expect(gender).toHaveAttribute("aria-checked", "true");

    await user.click(gender);
    expect(routerCalls.push).toEqual(["/members?hide=gender"]);
  });

  test("the column picker offers a reset only once a column was touched", async () => {
    const user = userEvent.setup();
    render(<HiddenColumns />);

    await user.click(screen.getByRole("button", { name: /columns/i }));

    expect(
      await screen.findByRole("menuitem", { name: "Reset columns" }),
    ).toBeInTheDocument();
    // A column already hidden shows as unchecked, not as missing.
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Gender" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  test("rows per page is a link, not a menu — nothing to open", () => {
    render(<Filtered />);

    // A menu needs JavaScript to open at all, and page size is a single-select
    // navigation between fixed URLs; only the two checkbox menus above earn one.
    expect(screen.queryByRole("button", { name: /rows per page/i })).toBeNull();
    expect(
      screen.getByRole("link", { name: "50 rows per page" }),
    ).toHaveAttribute("href", "/members?q=re&per=50&gender=female");
  });

  test("marks the page size in force and returns to page one on a change", () => {
    render(<LastPage />);

    expect(
      screen.getByRole("link", { name: "20 rows per page" }),
    ).toHaveAttribute("aria-current", "true");
    expect(
      screen.getByRole("link", { name: "50 rows per page" }),
    ).not.toHaveAttribute("aria-current");
    // Standing on page 13, a wider page must not keep the page number.
    expect(
      screen.getByRole("link", { name: "100 rows per page" }),
    ).toHaveAttribute("href", "/members?per=100");
  });
});

describe("DataTable facet with a default", () => {
  test("opens on the default selection without calling it a narrowing", async () => {
    const user = userEvent.setup();
    render(<DefaultedFacet />);

    // No Reset: the default view is the table's own, not something to undo.
    expect(screen.queryByRole("link", { name: "Reset" })).toBeNull();
    const trigger = screen.getByRole("button", { name: /status/i });
    expect(within(trigger).getByText("2")).toBeInTheDocument();

    await user.click(trigger);
    expect(
      await screen.findByRole("menuitemcheckbox", { name: "Active" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemcheckbox", { name: "Visitor" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemcheckbox", { name: "Inactive" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("menuitemcheckbox", { name: "Show all" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.queryByRole("menuitem", { name: /reset status/i })).toBeNull();
  });

  test("leaves the default out of the links the table builds", () => {
    render(<DefaultedFacet />);

    expect(screen.getByRole("link", { name: /^Name/ })).toHaveAttribute(
      "href",
      "/members?sort=name&dir=desc",
    );
  });

  test("ticking a hidden value adds it to what is already shown", async () => {
    const user = userEvent.setup();
    render(<DefaultedFacet />);

    await user.click(screen.getByRole("button", { name: /status/i }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Inactive" }));

    expect(routerCalls.push).toEqual([
      "/members?status=active&status=visitor&status=inactive",
    ]);
  });

  test("Show all lifts the filter with an explicit all", async () => {
    const user = userEvent.setup();
    render(<DefaultedFacet />);

    await user.click(screen.getByRole("button", { name: /status/i }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Show all" }));

    expect(routerCalls.push).toEqual(["/members?status=all"]);
  });

  test("showing all says so, and unticking it returns to the default", async () => {
    const user = userEvent.setup();
    render(<DefaultedFacetShowingAll />);

    const trigger = screen.getByRole("button", { name: /status/i });
    expect(within(trigger).getByText("All")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reset" })).toHaveAttribute(
      "href",
      "/members",
    );

    await user.click(trigger);
    const all = await screen.findByRole("menuitemcheckbox", { name: "Show all" });
    expect(all).toHaveAttribute("aria-checked", "true");
    await user.click(all);

    expect(routerCalls.push).toEqual(["/members"]);
  });

  test("a narrowed default facet offers a reset, not a clear", async () => {
    const user = userEvent.setup();
    render(<DefaultedFacetNarrowed />);

    await user.click(screen.getByRole("button", { name: /status/i }));
    await user.click(await screen.findByRole("menuitem", { name: "Reset status" }));

    expect(routerCalls.push).toEqual(["/members"]);
    expect(screen.queryByRole("menuitem", { name: /clear status/i })).toBeNull();
  });
});
