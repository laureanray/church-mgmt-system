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

const LEADER_HOLDS = [
  "dashboard.view",
  "attendance.view",
  "attendance.record",
  "members.view",
  "members.create",
  "members.update",
  "roles.view",
  "roles.update",
] as const;

/**
 * Edited by someone who holds only some permissions. The rest are locked in
 * their saved state; the note says why.
 */
export const LimitedEditor: Story = {
  args: {
    role: { name: "Usher", description: "Checks people in at the door." },
    selectedPermissions: ["dashboard.view", "attendance.view", "attendance.record", "services.view"],
    grantable: [...LEADER_HOLDS],
    permissionsNote:
      "Permissions you do not hold yourself are locked: you can neither grant nor remove them.",
  },
};

/** The editor's own role: every permission is locked, name and description are not. */
export const OwnRole: Story = {
  args: {
    role: { name: "Office Staff", description: "Runs staff accounts for the church office." },
    selectedPermissions: [...LEADER_HOLDS],
    grantable: [],
    permissionsNote:
      "This is your own role, so its permissions are locked. Ask another authorized staff member to change them.",
  },
};
