import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { DeleteRoleButton } from "./delete-role-button";

function DeleteRoleButtonStory({ name }: { name: string }) {
  return <DeleteRoleButton name={name} action={async () => undefined} />;
}

const meta = {
  title: "Roles/DeleteRoleButton",
  component: DeleteRoleButtonStory,
  args: { name: "Ministry Coordinator" },
} satisfies Meta<typeof DeleteRoleButtonStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
