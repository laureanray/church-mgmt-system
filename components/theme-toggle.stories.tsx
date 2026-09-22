import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ThemeToggle } from "./theme-toggle";

const meta = {
  title: "Patterns/ThemeToggle",
  component: ThemeToggle,
  parameters: {
    docs: {
      description: {
        component:
          "A compact header control that switches between light and dark mode. Use the Storybook theme toolbar to verify both visual states.",
      },
    },
  },
} satisfies Meta<typeof ThemeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="flex w-72 items-center justify-between border bg-background px-4 py-3 text-foreground">
      <span className="text-sm font-medium">IRM Ministries</span>
      <ThemeToggle />
    </div>
  ),
};
