import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { UserForm } from "./user-form";

function UserFormStory({ roleId }: { roleId: string }) {
  return (
    <UserForm
      action={async () => undefined}
      user={{
        id: "staff-1",
        name: "Maria Santos",
        email: "maria@example.com",
        roleId,
        mustChangePassword: false,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      }}
      roles={[
        { value: "admin", label: "Admin" },
        { value: "leader", label: "Leader" },
        { value: "usher", label: "Usher" },
      ]}
    />
  );
}

const meta = {
  title: "Users/UserForm",
  component: UserFormStory,
  parameters: { layout: "padded" },
  args: { roleId: "leader" },
} satisfies Meta<typeof UserFormStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
