import * as React from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "./button";

const meta = {
  title: "UI/Button",
  component: Button,
  args: { children: "Add Member" },
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "outline",
        "secondary",
        "ghost",
        "destructive",
        "link",
      ],
    },
    size: {
      control: "select",
      options: ["xs", "sm", "default", "lg", "icon-xs", "icon-sm", "icon", "icon-lg"],
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {(["default", "outline", "secondary", "ghost", "destructive", "link"] as const).map(
        (variant) => (
          <Button key={variant} variant={variant}>
            {variant}
          </Button>
        ),
      )}
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {(["xs", "sm", "default", "lg"] as const).map((size) => (
        <Button key={size} size={size}>
          {size}
        </Button>
      ))}
    </div>
  ),
};

export const WithIcon: Story = {
  render: (args) => (
    <Button {...args}>
      <Plus className="size-4" />
      Add Member
    </Button>
  ),
};

/** An icon-only control has no text to read, so `aria-label` is mandatory. */
export const IconOnly: Story = {
  args: { size: "icon-sm", variant: "ghost" },
  render: (args) => (
    <Button {...args} aria-label="Delete member">
      <Trash2 className="size-4" />
    </Button>
  ),
};

export const Disabled: Story = { args: { disabled: true } };

/**
 * A link that looks like a button is a `<Link>` wearing `buttonVariants()`, not
 * a `<Button>` with an onClick. Navigation must stay a real anchor so it can be
 * middle-clicked, copied, and prefetched.
 */
export const AsLink: Story = {
  render: () => (
    <Link href="/members/new" className={cn(buttonVariants())}>
      <Plus className="size-4" />
      Add Member
    </Link>
  ),
};
