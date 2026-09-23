import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { PermissionMatrix } from "./permission-matrix";

const meta = {
  title: "Roles/PermissionMatrix",
  component: PermissionMatrix,
  parameters: { layout: "padded" },
  args: {
    selected: ["dashboard.view", "attendance.view", "attendance.record", "members.view"],
  },
} satisfies Meta<typeof PermissionMatrix>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { selected: [] } };
export const Disabled: Story = { args: { disabled: true } };

/**
 * What a ministry may grant. Staff Users, Roles, Ministries and Settings are
 * absent: roster heads are not administrators, so those stay with roles.
 */
export const MinistryScope: Story = {
  args: { scope: "ministry", selected: ["services.view", "lam.view", "lam.lineups_update"] },
};
