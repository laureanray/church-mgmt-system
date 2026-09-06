import * as React from "react";
import Link from "next/link";
import { CalendarDays, Plus, Users } from "lucide-react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "./empty-state";

const meta = {
  title: "Patterns/EmptyState",
  component: EmptyState,
  argTypes: { icon: { control: false } },
  args: {
    icon: Users,
    title: "No members yet",
    description:
      "Add your first member to generate their attendance QR code.",
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// React elements stay out of `args` throughout this file: Storybook expects
// args to be JSON-serializable, and an element carries a cycle in development
// builds. Anything with a node prop is built in `render` instead.
export const WithAction: Story = {
  render: (args) => (
    <EmptyState
      {...args}
      action={
        <Link href="/members/new" className={cn(buttonVariants())}>
          <Plus className="size-4" />
          Add Member
        </Link>
      }
    />
  ),
};

/**
 * A search that matched nothing is not the same as an empty directory. It must
 * not offer "Add Member" — someone whose search missed is one click from
 * creating a duplicate of the record they were looking for.
 */
export const NoSearchResults: Story = {
  args: {
    title: "No members match your search",
    description: "Try a different name.",
  },
};

export const WithoutIcon: Story = {
  args: { icon: undefined, description: undefined, title: "No members yet." },
};

/**
 * Inside a Card the dashed border has to go: the card already draws one, and
 * two nested borders read as a rendering bug rather than a placeholder.
 */
export const Inline: Story = {
  args: {
    variant: "inline",
    icon: CalendarDays,
    title: "No services yet",
    description: "Create a schedule or a one-off service, then scan members in.",
  },
  render: (args) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">All Services</CardTitle>
      </CardHeader>
      <CardContent>
        <EmptyState {...args} />
      </CardContent>
    </Card>
  ),
};
