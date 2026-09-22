import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ComponentProps } from "react";

import { RoleForm } from "./role-form";

function RoleFormStory(
  props: Omit<ComponentProps<typeof RoleForm>, "action">,
) {
  return <RoleForm {...props} action={async () => undefined} />;
}

const meta = {
  title: "Roles/RoleForm",
  component: RoleFormStory,
  parameters: { layout: "padded" },
  args: {
    selectedPermissions: ["dashboard.view", "members.view", "members.update"],
  },
} satisfies Meta<typeof RoleForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {};
export const Edit: Story = {
  args: {
    role: { name: "Ministry Coordinator", description: "Maintains member records for a ministry." },
  },
};
export const ProtectedAdmin: Story = {
  args: {
    role: { name: "Admin", description: "Full access to every module and permission." },
    protectedRole: true,
  },
};
