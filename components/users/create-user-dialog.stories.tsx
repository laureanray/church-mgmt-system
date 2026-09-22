import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { CreateUserDialog } from "./create-user-dialog";

function CreateUserDialogStory({
  roles,
}: {
  roles: { value: string; label: string }[];
}) {
  return <CreateUserDialog roles={roles} action={async () => undefined} />;
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
  },
} satisfies Meta<typeof CreateUserDialogStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
