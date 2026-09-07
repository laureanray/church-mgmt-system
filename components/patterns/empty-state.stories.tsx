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
  args: {
    title: "No members yet",
    description:
      "Add your first member to generate their attendance QR code.",
  },
  // `icon` is supplied here rather than through args for the same reason as the
  // node props below: Storybook expects args to be JSON-serializable, and a
  // component reference is not. Stories needing a different icon (or none)
  // override `render`.
  render: (args) => <EmptyState {...args} icon={Users} />,
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithAction: Story = {
  render: (args) => (
    <EmptyState
      {...args}
      icon={Users}
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
  args: { description: undefined, title: "No members yet." },
  render: (args) => <EmptyState {...args} />,
};

/**
 * Inside a Card the dashed border has to go: the card already draws one, and
 * two nested borders read as a rendering bug rather than a placeholder.
 */
export const Inline: Story = {
  args: {
    variant: "inline",
    title: "No services yet",
    description: "Create a schedule or a one-off service, then scan members in.",
  },
  render: (args) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">All Services</CardTitle>
      </CardHeader>
      <CardContent>
        <EmptyState {...args} icon={CalendarDays} />
      </CardContent>
    </Card>
  ),
};
