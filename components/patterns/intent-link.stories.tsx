import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

import { IntentLink } from "./intent-link";

/**
 * Renders exactly like a `<Link>` — the difference is invisible here. Prefetch
 * only runs in a production build, so Storybook shows the markup and the
 * handler composition, not the network effect; check that with the Network tab
 * against `bun run build && bun run start`.
 */
const meta = {
  title: "Patterns/IntentLink",
  component: IntentLink,
  args: { href: "/members", children: "Members" },
} satisfies Meta<typeof IntentLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <IntentLink {...args} className="text-sm underline underline-offset-4" />
  ),
};

/** Styled as a button, as primary actions in a page header are. */
export const AsButton: Story = {
  args: { href: "/members/new", children: "Add Member" },
  render: (args) => (
    <IntentLink {...args} className={cn(buttonVariants())} />
  ),
};
