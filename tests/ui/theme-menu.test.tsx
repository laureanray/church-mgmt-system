import { afterEach, describe, expect, test } from "bun:test";
import { composeStories } from "@storybook/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "next-themes";

import * as stories from "@/components/theme-menu.stories";
import { ThemeSwitcher } from "@/components/theme-menu";

const { Default, Open, Unresolved } = composeStories(stories);

afterEach(() => {
  document.documentElement.classList.remove("dark", "light");
  window.localStorage.removeItem("theme");
});

function renderInProvider() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ThemeSwitcher />
    </ThemeProvider>,
  );
}

describe("ThemeMenu", () => {
  test("has an accessible name and renders both theme icons", () => {
    render(<Default />);

    const trigger = screen.getByRole("button", { name: "Color theme" });
    expect(trigger).toHaveAttribute("type", "button");
    expect(trigger.querySelectorAll("svg")).toHaveLength(2);
  });

  test("offers light, dark and system, checking the stored preference", async () => {
    render(<Open />);

    const dark = await screen.findByRole("menuitemradio", { name: "Dark" });
    expect(dark).toHaveAttribute("aria-checked", "true");
    for (const name of ["Light", "System"]) {
      expect(screen.getByRole("menuitemradio", { name })).toHaveAttribute(
        "aria-checked",
        "false",
      );
    }
  });

  test("checks nothing before the preference is known", async () => {
    render(<Unresolved />);

    const items = await screen.findAllByRole("menuitemradio");
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item).toHaveAttribute("aria-checked", "false");
    }
  });

  test("persists an explicit dark preference through the application provider", async () => {
    const user = userEvent.setup();
    renderInProvider();

    await user.click(screen.getByRole("button", { name: "Color theme" }));
    await user.click(
      await screen.findByRole("menuitemradio", { name: "Dark" }),
    );

    await waitFor(() =>
      expect(document.documentElement).toHaveClass("dark"),
    );
    expect(window.localStorage.getItem("theme")).toBe("dark");
  });

  test("returns to following the device when System is chosen", async () => {
    window.localStorage.setItem("theme", "dark");
    const user = userEvent.setup();
    renderInProvider();

    await waitFor(() =>
      expect(document.documentElement).toHaveClass("dark"),
    );
    await user.click(screen.getByRole("button", { name: "Color theme" }));
    expect(
      await screen.findByRole("menuitemradio", { name: "Dark" }),
    ).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("menuitemradio", { name: "System" }));

    await waitFor(() =>
      expect(window.localStorage.getItem("theme")).toBe("system"),
    );
    // happy-dom's matchMedia never matches, so the device reads as light.
    await waitFor(() =>
      expect(document.documentElement).toHaveClass("light"),
    );
    expect(document.documentElement).not.toHaveClass("dark");
  });
});
