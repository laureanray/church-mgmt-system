import { afterEach, describe, expect, test } from "bun:test";
import { composeStories } from "@storybook/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "next-themes";

import * as stories from "@/components/theme-toggle.stories";
import { ThemeToggle } from "@/components/theme-toggle";

const { Default } = composeStories(stories);

afterEach(() => {
  document.documentElement.classList.remove("dark", "light");
  window.localStorage.removeItem("theme");
});

describe("ThemeToggle", () => {
  test("has an accessible name and renders both theme icons", () => {
    render(<Default />);

    const toggle = screen.getByRole("button", { name: "Toggle color theme" });
    expect(toggle).toHaveAttribute("type", "button");
    expect(toggle.querySelectorAll("svg")).toHaveLength(2);
  });

  test("persists a dark preference through the application provider", async () => {
    render(
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
      >
        <ThemeToggle />
      </ThemeProvider>,
    );

    await waitFor(() =>
      expect(document.documentElement).toHaveClass("light"),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Toggle color theme" }),
    );

    await waitFor(() =>
      expect(document.documentElement).toHaveClass("dark"),
    );
    expect(window.localStorage.getItem("theme")).toBe("dark");
  });
});
