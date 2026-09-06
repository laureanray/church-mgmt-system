import * as React from "react";
import { CalendarDays, TrendingUp, Users } from "lucide-react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StatCard } from "./stat-card";

const meta = {
  title: "Patterns/StatCard",
  component: StatCard,
  args: { label: "Members", value: 248, icon: Users },
} satisfies Meta<typeof StatCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Accented: Story = {
  args: { label: "Check-ins (7 days)", value: 96, icon: TrendingUp, accent: true },
};

/**
 * The dashboard's real top row. `accent` appears exactly once: it marks the
 * figure the row is about, so using it twice would flatten the distinction back
 * to nothing.
 */
export const DashboardRow: Story = {
  parameters: { layout: "fullscreen" },
  render: () => (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Members" value={248} icon={Users} />
      <StatCard label="Services" value={36} icon={CalendarDays} />
      <StatCard label="Total Check-ins" value={4821} icon={TrendingUp} />
      <StatCard label="Check-ins (7 days)" value={96} icon={TrendingUp} accent />
    </div>
  ),
};

/** Long values must not push the icon out of the card. */
export const LongValue: Story = {
  args: { label: "Total Check-ins", value: "1,204,558" },
};
