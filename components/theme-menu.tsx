"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const THEME_PREFERENCES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number]["value"];

/**
 * Picks light, dark, or whatever the device is set to. The menu shows the
 * stored *preference*; the trigger shows the *resolved* theme, drawn from the
 * root `dark` class so it is right on first paint without waiting to hydrate.
 */
export function ThemeMenu({
  value,
  onValueChange,
  defaultOpen,
}: {
  /** `undefined` until next-themes has read storage on the client. */
  value: string | undefined;
  onValueChange: (value: ThemePreference) => void;
  defaultOpen?: boolean;
}) {
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Color theme"
            title="Color theme"
          />
        }
      >
        <Sun className="size-4 dark:hidden" aria-hidden="true" />
        <Moon className="hidden size-4 dark:block" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          {/* `null`, not `undefined`, keeps the group controlled before mount. */}
          <DropdownMenuRadioGroup
            value={value ?? null}
            onValueChange={(next: ThemePreference) => onValueChange(next)}
          >
            {THEME_PREFERENCES.map(({ value, label, icon: Icon }) => (
              <DropdownMenuRadioItem key={value} value={value} closeOnClick>
                <Icon aria-hidden="true" />
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The header's theme control, bound to the app's `next-themes` provider. */
export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  return <ThemeMenu value={theme} onValueChange={setTheme} />;
}
