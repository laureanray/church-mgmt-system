import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { composeStories } from "@storybook/react";

import * as stories from "@/components/ui/badge.stories";

const { Default, Status, Sizes, AsLink } = composeStories(stories);

describe("Badge", () => {
  test("renders its content", () => {
    render(<Default />);

    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  // The whole point of the status variants: a badge must never reach for a
  // palette utility like `text-amber-600`, because that opts out of the theme
  // and its dark variant is an unchecked guess.
  test("draws every status colour from a semantic token", () => {
    const { container } = render(<Status />);

    const classNames = [...container.querySelectorAll("span")]
      .map((el) => el.className)
      .join(" ");

    expect(classNames).toContain("text-success");
    expect(classNames).toContain("text-warning");
    expect(classNames).toContain("text-info");
    expect(classNames).toContain("text-destructive");
    expect(classNames).not.toMatch(/\b(text|bg|border)-(amber|emerald|green|red|blue)-\d/);
  });

  test("scales without the caller hand-rolling a pill", () => {
    render(<Sizes />);

    expect(screen.getByText("12").className).toContain("h-5");
    expect(screen.getByText("132").className).toContain("h-6");
  });

  // Base UI composes through `render`, not `asChild`.
  test("renders as an anchor when given one", () => {
    render(<AsLink />);

    expect(
      screen.getByRole("link", { name: "Sunday Service" }),
    ).toHaveAttribute("href", "#members");
  });
});
