import { describe, expect, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import { composeStories } from "@storybook/react";

import * as cardStories from "@/components/ui/card.stories";
import * as backLinkStories from "@/components/patterns/back-link.stories";
import * as detailListStories from "@/components/patterns/detail-list.stories";
import * as infoTileStories from "@/components/patterns/info-tile.stories";
import * as pageContainerStories from "@/components/patterns/page-container.stories";
import * as pageHeaderStories from "@/components/patterns/page-header.stories";
import * as statCardStories from "@/components/patterns/stat-card.stories";
import * as tableCardStories from "@/components/patterns/table-card.stories";

describe("BackLink", () => {
  const { Default } = composeStories(backLinkStories);

  test("is a real anchor to the parent route", () => {
    render(<Default />);

    expect(
      screen.getByRole("link", { name: "Back to members" }),
    ).toHaveAttribute("href", "/members");
  });
});

describe("PageContainer", () => {
  const { Record, Form } = composeStories(pageContainerStories);

  test("gives a record the full width a list has", () => {
    const { container } = render(<Record />);

    const frame = container.querySelector('[data-slot="page-container"]');
    expect(frame).toHaveAttribute("data-width", "full");
    expect(frame?.className).not.toMatch(/max-w-/);
  });

  test("caps a form's width without centring it", () => {
    const { container } = render(<Form />);

    const frame = container.querySelector('[data-slot="page-container"]');
    expect(frame).toHaveAttribute("data-width", "form");
    expect(frame?.className).toMatch(/\bmax-w-3xl\b/);
    expect(frame?.className).not.toMatch(/\bmx-auto\b/);
  });
});

describe("PageHeader", () => {
  const { Default, TitleOnly, WithAction } = composeStories(pageHeaderStories);

  test("renders the title as the page's h1", () => {
    render(<Default />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Members");
  });

  test("omits the description paragraph when there is none", () => {
    render(<TitleOnly />);

    expect(
      screen.queryByText("248 members in your church directory."),
    ).toBeNull();
  });

  test("renders actions alongside the title", () => {
    render(<WithAction />);

    expect(screen.getByRole("link", { name: /add member/i })).toHaveAttribute(
      "href",
      "/members/new",
    );
  });
});

describe("StatCard", () => {
  const { Default, LongValue, DashboardRow } = composeStories(statCardStories);

  test("renders the label and figure", () => {
    render(<Default />);

    expect(screen.getByText("Members")).toBeInTheDocument();
    expect(screen.getByText("248")).toBeInTheDocument();
  });

  // Figures sit next to each other in a grid; a counter ticking 9 → 10 must not
  // shift its neighbours, which is what `tabular-nums` buys.
  test("renders figures with tabular figures", () => {
    render(<Default />);

    expect(screen.getByText("248").className).toContain("tabular-nums");
  });

  test("keeps a pre-formatted string intact", () => {
    render(<LongValue />);

    expect(screen.getByText("1,204,558")).toBeInTheDocument();
  });

  test("accents exactly one card in the dashboard row", () => {
    const { container } = render(<DashboardRow />);

    expect(container.querySelectorAll(".text-primary")).toHaveLength(1);
  });
});

describe("InfoTile", () => {
  const { Default, Empty, Accented } = composeStories(infoTileStories);

  test("renders the label and value", () => {
    render(<Default />);

    expect(screen.getByText("When")).toBeInTheDocument();
    expect(screen.getByText("7 Sep 2026, 9:00 AM")).toBeInTheDocument();
  });

  test("shows an em dash for an unset column", () => {
    render(<Empty />);

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  test("opts into tabular figures only when the value is numeric", () => {
    render(<Accented />);
    expect(screen.getByText("132").className).toContain("tabular-nums");

    render(<Default />);
    expect(screen.getByText("7 Sep 2026, 9:00 AM").className).not.toContain(
      "tabular-nums",
    );
  });
});

describe("DetailList", () => {
  const { Default, WithEmptyValues } = composeStories(detailListStories);

  test("pairs each label with its value in a description list", () => {
    render(<Default />);

    expect(screen.getByText("Birthdate").tagName).toBe("DT");
    expect(screen.getByText("14 Mar 1988").tagName).toBe("DD");
  });

  test("renders an em dash for null, undefined and empty values", () => {
    render(<WithEmptyValues />);

    expect(screen.getAllByText("—")).toHaveLength(3);
  });

  // The trap in `value || "—"`: a real zero is falsy, so callers must stringify
  // it. This pins the behaviour so the workaround is not silently removed.
  test("renders a stringified zero rather than a dash", () => {
    render(<WithEmptyValues />);

    expect(screen.getByText("0")).toBeInTheDocument();
  });
});

describe("TableCard", () => {
  const { Default } = composeStories(tableCardStories);

  test("frames a table with its header row intact", () => {
    render(<Default />);

    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader")).toHaveLength(4);
    expect(within(table).getAllByRole("row")).toHaveLength(4);
  });

  // `overflow-hidden` is what clips the header's background to the rounded
  // border; without it the top corners square off.
  test("clips its children to the rounded border", () => {
    const { container } = render(<Default />);

    expect(container.firstElementChild?.className).toContain("overflow-hidden");
  });
});

describe("Card", () => {
  const { WithAction } = composeStories(cardStories);

  // `CardHeader` is a grid that only opens its second column for a
  // `data-slot="card-action"` child. Styling a plain child with
  // `flex-row justify-between` is inert and wraps it under the title instead.
  test("places trailing header content in the header's action column", () => {
    const { container } = render(<WithAction />);

    const action = container.querySelector('[data-slot="card-action"]');
    expect(action).not.toBeNull();
    expect(action?.className).toContain("col-start-2");
    expect(action?.querySelector("a")).toHaveAttribute("href", "/services");
  });
});
