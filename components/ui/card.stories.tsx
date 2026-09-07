import * as React from "react";
import Link from "next/link";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Badge } from "./badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";
import { Button } from "./button";

const meta: Meta<typeof Card> = {
  title: "UI/Card",
  component: Card,
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Google Sheets</CardTitle>
        <CardDescription>
          Push attendance to a spreadsheet you control.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Attendance rows are appended after each service.
        </p>
      </CardContent>
    </Card>
  ),
};

/**
 * Trailing header content goes in `CardAction`, and this is the one Base UI
 * detail worth memorising: `CardHeader` is a **grid**, and it only opens a
 * second column when it sees `data-slot="card-action"`.
 *
 * Writing `<CardHeader className="flex-row justify-between">` looks right and
 * does nothing — `flex-row` sets a flex direction on an element that is not a
 * flex container — so the link quietly wraps under the title instead.
 */
export const WithAction: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Services</CardTitle>
        <CardAction>
          <Link
            href="/services"
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            View all
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Two services this week.</p>
      </CardContent>
    </Card>
  ),
};

export const WithBadgeAction: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Live check-ins</CardTitle>
        <CardAction>
          <Badge variant="brand" size="lg" className="font-semibold tabular-nums">
            132
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Scanned members appear here.
        </p>
      </CardContent>
    </Card>
  ),
};

export const WithFooter: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Promote to Leader</CardTitle>
        <CardDescription>
          Creates a cell group with this member as its leader.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          A member leads at most one cell.
        </p>
      </CardContent>
      <CardFooter>
        <Button size="sm" variant="outline">
          Create cell &amp; make leader
        </Button>
      </CardFooter>
    </Card>
  ),
};
