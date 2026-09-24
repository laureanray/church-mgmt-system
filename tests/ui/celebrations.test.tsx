import { describe, expect, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import { composeStories } from "@storybook/react";

import * as badgeStories from "@/components/celebrations/celebration-kind-badge.stories";
import * as tabsStories from "@/components/celebrations/celebration-range-tabs.stories";
import * as tableStories from "@/components/celebrations/celebrations-table.stories";

const { Week, Month, Empty, DashboardCard } = composeStories(tableStories);

function rowFor(name: string, kind: string) {
  return screen
    .getAllByRole("row")
    .find(
      (row) =>
        within(row).queryByText(name) && within(row).queryAllByText(kind).length > 0,
    );
}

describe("CelebrationsTable", () => {
  test("the week from 30 December runs into January", () => {
    render(<Week />);

    const row = rowFor("Ana Reyes", "Wedding anniversary");
    expect(row).toBeDefined();
    expect(within(row!).getByText("Sat, Jan 2")).toHaveAttribute(
      "dateTime",
      "2027-01-02",
    );
    expect(within(row!).getByText("15 years")).toBeInTheDocument();
  });

  test("marks today's rows and shows the age turned", () => {
    render(<Week />);

    const row = rowFor("Ana Reyes", "Birthday")!;
    expect(within(row).getByText("Today")).toBeInTheDocument();
    expect(within(row).getByText("Turns 38")).toBeInTheDocument();
  });

  test("leaves out the unmarried's anniversary and the deceased", () => {
    render(<Week />);

    expect(rowFor("Elena Villanueva", "Wedding anniversary")).toBeUndefined();
    expect(screen.queryByText("Fidel Ramos")).toBeNull();
  });

  test("links each name and cell group", () => {
    render(<Month />);

    const row = rowFor("Dennis Santos", "Birthday")!;
    expect(within(row).getByRole("link", { name: "Dennis Santos" })).toHaveAttribute(
      "href",
      "/members/4",
    );
    expect(
      within(row).getByRole("link", { name: "Couples for Christ" }),
    ).toHaveAttribute("href", "/cell-groups/c2");
  });

  test("the dashboard card drops the cell-group column", () => {
    render(<DashboardCard />);

    expect(screen.queryByRole("columnheader", { name: "Cell Group" })).toBeNull();
    expect(screen.getAllByRole("row").length).toBeLessThanOrEqual(6);
    expect(screen.getByRole("link", { name: "View all" })).toHaveAttribute(
      "href",
      "/celebrations?range=week",
    );
  });

  test("says so when nothing falls in the range", () => {
    render(<Empty />);

    expect(
      screen.getByText("No celebrations in the next 7 days"),
    ).toBeInTheDocument();
  });
});

describe("CelebrationRangeTabs", () => {
  const { Week: WeekTabs, Month: MonthTabs } = composeStories(tabsStories);

  test("each range is a link to its URL", () => {
    render(<WeekTabs />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.getAttribute("href"))).toEqual([
      "/celebrations?range=week",
      "/celebrations?range=month",
    ]);
  });

  test("selects the range the URL names", () => {
    render(<MonthTabs />);

    expect(screen.getByRole("tab", { name: "This month" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Next 7 days" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByRole("tabpanel")).toHaveTextContent(
      "The selected range's list renders here.",
    );
  });
});

describe("CelebrationKindBadge", () => {
  const { AllKinds } = composeStories(badgeStories);

  test("labels each kind with a token tone", () => {
    const { container } = render(<AllKinds />);

    for (const label of ["Birthday", "Spiritual birthday", "Wedding anniversary"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    const classNames = [...container.querySelectorAll("[data-slot=badge]")]
      .map((el) => el.className)
      .join(" ");
    expect(classNames).toContain("text-primary");
    expect(classNames).toContain("text-info");
    expect(classNames).toContain("text-success");
  });
});
