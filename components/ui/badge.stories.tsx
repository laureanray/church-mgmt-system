import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Badge } from "./badge";

const meta = {
  title: "UI/Badge",
  component: Badge,
  args: { children: "Admin" },
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "secondary",
        "outline",
        "ghost",
        "brand",
        "success",
        "warning",
        "info",
        "destructive",
        "link",
      ],
    },
    size: { control: "inline-radio", options: ["default", "lg"] },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {(
        [
          "default",
          "secondary",
          "outline",
          "ghost",
          "brand",
          "success",
          "warning",
          "info",
          "destructive",
        ] as const
      ).map((variant) => (
        <Badge key={variant} variant={variant}>
          {variant}
        </Badge>
      ))}
    </div>
  ),
};

/**
 * Status colour comes from a token, never from a palette utility. A badge
 * written as `text-amber-600 dark:text-amber-400` has opted out of the theme:
 * it will not follow a rebrand, and its dark variant is a guess rather than a
 * checked contrast.
 */
export const Status: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="success">Connected</Badge>
      <Badge variant="warning">Must reset password</Badge>
      <Badge variant="info">Scheduled</Badge>
      <Badge variant="destructive">Sync failed</Badge>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Badge variant="brand">12</Badge>
      <Badge variant="brand" size="lg" className="font-semibold tabular-nums">
        <CheckCircle2 className="size-3.5" />
        132
      </Badge>
    </div>
  ),
};

/**
 * Base UI composes through `render`, not `asChild`. A badge that navigates has
 * to be given a real anchor this way — the `[a]:hover:` rules in each variant
 * only fire once there is an `<a>` to match.
 */
export const AsLink: Story = {
  args: { variant: "secondary" },
  render: (args) => (
    <Badge {...args} render={<a href="#members" />}>
      Sunday Service
    </Badge>
  ),
};
