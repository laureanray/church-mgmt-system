import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { composeStories } from "@storybook/react";

import * as stories from "@/components/patterns/empty-state.stories";

const { Default, WithAction, NoSearchResults, WithoutIcon, Inline } =
  composeStories(stories);

describe("EmptyState", () => {
  test("renders the title and description as a heading and body copy", () => {
    render(<Default />);

    expect(
      screen.getByRole("heading", { name: "No members yet" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Add your first member to generate their attendance QR code.",
      ),
    ).toBeInTheDocument();
  });

  test("renders the action when the collection is empty", () => {
    render(<WithAction />);

    expect(screen.getByRole("link", { name: /add member/i })).toHaveAttribute(
      "href",
      "/members/new",
    );
  });

  // The distinction that keeps duplicate members out of the directory: a search
  // that matched nothing must not offer to create a record.
  test("offers no create action when a search returned nothing", () => {
    render(<NoSearchResults />);

    expect(
      screen.getByRole("heading", { name: "No members match your search" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  test("omits the icon well when no icon is given", () => {
    const { container } = render(<WithoutIcon />);

    expect(container.querySelector("svg")).toBeNull();
  });

  test("drops the dashed border inside a card", () => {
    const { container } = render(<Inline />);

    const region = container.querySelector("h3")?.parentElement;
    expect(region?.className).not.toContain("border-dashed");
  });

  test("draws its own dashed border when it stands in for the page body", () => {
    const { container } = render(<Default />);

    const region = container.querySelector("h3")?.parentElement;
    expect(region?.className).toContain("border-dashed");
  });
});
