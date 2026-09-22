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
