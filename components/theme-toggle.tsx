"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

/** Switches between the resolved light and dark themes. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme, themes } = useTheme();

  function toggleTheme() {
    // Storybook owns its root theme class, so the component can still be
    // exercised there without installing a second, competing provider.
    if (themes.length === 0) {
      document.documentElement.classList.toggle("dark");
      return;
    }

    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle color theme"
      title="Toggle color theme"
      onClick={toggleTheme}
    >
      <Sun className="size-4 dark:hidden" aria-hidden="true" />
      <Moon className="hidden size-4 dark:block" aria-hidden="true" />
    </Button>
  );
}
