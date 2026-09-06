import * as React from "react";
import { CalendarDays, MapPin, Users } from "lucide-react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { InfoTile } from "./info-tile";

const meta = {
  title: "Patterns/InfoTile",
  component: InfoTile,
  args: { label: "When", value: "7 Sep 2026, 9:00 AM", icon: CalendarDays },
} satisfies Meta<typeof InfoTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Accented: Story = {
  args: { label: "Total Attendance", value: 132, icon: Users, accent: true, numeric: true },
};

/** An unset column arrives as an em dash, never a blank tile. */
export const Empty: Story = {
  args: { label: "Location", value: "—", icon: MapPin },
};

export const ServiceHeaderRow: Story = {
  parameters: { layout: "fullscreen" },
  render: () => (
    <div className="grid gap-4 sm:grid-cols-3">
      <InfoTile label="When" value="7 Sep 2026, 9:00 AM" icon={CalendarDays} />
      <InfoTile label="Location" value="Main Sanctuary" icon={MapPin} />
      <InfoTile label="Total Attendance" value={132} icon={Users} accent numeric />
    </div>
  ),
};
