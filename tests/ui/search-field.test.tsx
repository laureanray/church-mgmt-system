import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { composeStories } from "@storybook/react";

import * as stories from "@/components/patterns/search-field.stories";

const { Default, WithActiveQuery } = composeStories(stories);

describe("SearchField", () => {
  test("labels the input for assistive tech, not just with a placeholder", () => {
    render(<Default />);

    expect(
      screen.getByRole("textbox", { name: "Search members by name" }),
    ).toBeInTheDocument();
  });

  // The field name becomes the query-string key, so a search is a plain GET
  // navigation and its result stays linkable and back-button-safe.
  test("submits its value as the ?q= parameter", () => {
    render(<Default />);

    const input = screen.getByRole("textbox", { name: "Search members by name" });
    expect(input).toHaveAttribute("name", "q");
    expect(input.closest("form")?.getAttribute("method")).toBeNull();
  });

  test("reflects the active query from the URL", () => {
    render(<WithActiveQuery />);

    expect(
      screen.getByRole("textbox", { name: "Search members by name" }),
    ).toHaveValue("Santos");
  });

  test("accepts typed input", async () => {
    const user = userEvent.setup();
    render(<Default />);

    const input = screen.getByRole("textbox", { name: "Search members by name" });
    await user.type(input, "Reyes");

    expect(input).toHaveValue("Reyes");
  });

  // Enter submits a single-input form, but iOS Safari shows no "Go" key without
  // a visible submit control — so the button is not redundant.
  test("has a visible submit control", () => {
    render(<Default />);

    expect(screen.getByRole("button", { name: "Search" })).toHaveAttribute(
      "type",
      "submit",
    );
  });
});
