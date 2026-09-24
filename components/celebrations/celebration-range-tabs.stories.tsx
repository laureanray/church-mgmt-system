import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { CELEBRATION_RANGES } from "@/lib/celebrations";
import { CelebrationRangeTabs } from "./celebration-range-tabs";

const meta = {
  title: "Celebrations/CelebrationRangeTabs",
  component: CelebrationRangeTabs,
  args: { range: "week", children: "The selected range's list renders here." },
  argTypes: {
    range: { control: "inline-radio", options: [...CELEBRATION_RANGES] },
  },
} satisfies Meta<typeof CelebrationRangeTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Each tab is a link to `?range=`; in the app the server renders the matching
 * list as the panel. Here the panel is placeholder text.
 */
export const Week: Story = {};

export const Month: Story = { args: { range: "month" } };
