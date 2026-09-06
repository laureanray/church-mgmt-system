import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { BackLink } from "./back-link";

const meta = {
  title: "Patterns/BackLink",
  component: BackLink,
  args: { href: "/members", label: "Back to members" },
} satisfies Meta<typeof BackLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * The label names the destination, not the action: "Back to members" tells the
 * reader where they land, while a bare "Back" makes them guess.
 */
export const ToParentRecord: Story = {
  args: { href: "/services/1", label: "Back to service" },
};
