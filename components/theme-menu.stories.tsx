import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ThemeMenu, type ThemePreference } from "./theme-menu";

/**
 * Runs the menu against local state. Binding it to next-themes here would
 * fight the toolbar for the root `dark` class, so the canvas theme stays the
 * toolbar's job and the menu only tracks its own selection.
 */
function ThemeMenuStory({
  initial,
  defaultOpen,
}: {
  initial: ThemePreference | null;
  defaultOpen: boolean;
}) {
  const [value, setValue] = React.useState(initial ?? undefined);
  return (
    <div className="flex h-44 w-72 items-start justify-between">
      <div className="flex w-full items-center justify-between border bg-background px-4 py-3 text-foreground">
        <span className="text-sm font-medium">IRM Ministries</span>
        <ThemeMenu
          value={value}
          onValueChange={setValue}
          defaultOpen={defaultOpen}
        />
      </div>
    </div>
  );
}

const meta = {
  title: "Patterns/ThemeMenu",
  component: ThemeMenuStory,
  parameters: {
    docs: {
      description: {
        component:
          "The header's colour-theme control: Light, Dark, or System, which follows the device setting and changes with it. The trigger icon shows the theme actually applied; the checked item is the stored preference. In the app, `ThemeSwitcher` binds it to next-themes. Use the Storybook theme toolbar to verify both visual states.",
      },
    },
  },
  args: { initial: "system", defaultOpen: false },
  argTypes: {
    initial: { control: "inline-radio", options: ["light", "dark", "system"] },
  },
} satisfies Meta<typeof ThemeMenuStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Closed, following the device. Click the trigger or press Enter to choose. */
export const Default: Story = {};

/** Open with an explicit dark preference, showing the checked item. */
export const Open: Story = { args: { initial: "dark", defaultOpen: true } };

/** Before next-themes has read storage on the client, nothing is checked. */
export const Unresolved: Story = { args: { initial: null, defaultOpen: true } };
