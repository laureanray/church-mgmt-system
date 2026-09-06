import * as React from "react";
import Link from "next/link";
import { Plus, QrCode } from "lucide-react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "./page-header";

const meta = {
  title: "Patterns/PageHeader",
  component: PageHeader,
  parameters: { layout: "fullscreen" },
  args: {
    title: "Members",
    description: "248 members in your church directory.",
  },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const TitleOnly: Story = { args: { description: undefined } };

// Node props are built in `render`, never passed as args: Storybook expects
// args to be JSON-serializable and a React element carries a cycle in dev.
export const WithAction: Story = {
  render: (args) => (
    <PageHeader {...args}>
      <Link href="/members/new" className={cn(buttonVariants())}>
        <Plus className="size-4" />
        Add Member
      </Link>
    </PageHeader>
  ),
};

/**
 * Actions stack under the title below `sm`. Resize the canvas to check it — a
 * row of three buttons is what overflows first on a phone, and the scan screen
 * is used on phones.
 */
export const WithManyActions: Story = {
  args: { title: "Sunday Service — 7 Sep", description: undefined },
  render: (args) => (
    <PageHeader {...args}>
      <Link href="/scan" className={cn(buttonVariants())}>
        <QrCode className="size-4" />
        Scan attendance
      </Link>
      <Link
        href="/services/1/edit"
        className={cn(buttonVariants({ variant: "outline" }))}
      >
        Edit
      </Link>
      <Link
        href="/services"
        className={cn(buttonVariants({ variant: "destructive" }))}
      >
        Delete
      </Link>
    </PageHeader>
  ),
};
