import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { CreateUserDialog } from "./create-user-dialog";

function CreateUserDialogStory({
  roles,
  memberOptions,
}: {
  roles: { value: string; label: string }[];
  memberOptions?: { value: string; label: string }[];
}) {
  return (
    <CreateUserDialog
      roles={roles}
      memberOptions={memberOptions}
      action={async () => undefined}
    />
  );
}

const meta = {
  title: "Users/CreateUserDialog",
  component: CreateUserDialogStory,
  args: {
    roles: [
      { value: "admin", label: "Admin" },
      { value: "leader", label: "Leader" },
      { value: "usher", label: "Usher" },
    ],
    memberOptions: [
      { value: "m1", label: "Juan Dela Cruz" },
      { value: "m2", label: "Maria Santos" },
    ],
  },
} satisfies Meta<typeof CreateUserDialogStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Every member already has a login; the field still offers "Not linked". */
export const NoUnlinkedMembers: Story = { args: { memberOptions: [] } };

/**
 * The viewer can create logins but not edit them. Linking a member is a
 * `users.update` action, so the field is left out.
 */
export const WithoutMemberLinking: Story = { args: { memberOptions: undefined } };
