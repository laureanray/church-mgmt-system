import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { composeStories } from "@storybook/react";

import * as stories from "@/components/members/member-status-badge.stories";

const { Visitor, Inactive, Transferred, Deceased, Active, AllStatuses } =
  composeStories(stories);

describe("MemberStatusBadge", () => {
  test("labels every status other than active", () => {
    for (const [Story, label] of [
      [Visitor, "Visitor"],
      [Inactive, "Inactive"],
      [Transferred, "Transferred"],
      [Deceased, "Deceased"],
    ] as const) {
      const { unmount } = render(<Story />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  test("renders nothing for an active member", () => {
    const { container } = render(<Active />);
    expect(container).toBeEmptyDOMElement();
  });

  test("tones come from semantic tokens", () => {
    const { container } = render(<AllStatuses />);
    const classNames = [...container.querySelectorAll("[data-slot=badge]")]
      .map((el) => el.className)
      .join(" ");
    expect(container.querySelectorAll("[data-slot=badge]")).toHaveLength(4);
    expect(classNames).toContain("text-info");
    expect(classNames).toContain("text-warning");
    expect(classNames).not.toMatch(/\b(text|bg|border)-(amber|emerald|green|red|blue|sky|gray)-\d/);
  });
});
