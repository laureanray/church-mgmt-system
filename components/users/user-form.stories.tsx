import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { UserForm } from "./user-form";

function UserFormStory({
  roleId,
  memberId,
  errors,
}: {
  roleId: string;
  memberId?: string | null;
  /** Field errors the stand-in action returns on submit. */
  errors?: Record<string, string>;
}) {
  return (
    <UserForm
      action={async () => (errors ? { errors } : undefined)}
      memberId={memberId}
      memberOptions={[
        { value: "m1", label: "Juan Dela Cruz" },
        { value: "m2", label: "Maria Santos" },
        { value: "m3", label: "Pedro Reyes" },
      ]}
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

/** Linked to a member record, so the member's ministries add to the role. */
export const LinkedMember: Story = { args: { memberId: "m2" } };

/** Submit to see the error for a member another login already claims. */
export const MemberAlreadyLinked: Story = {
  args: {
    memberId: "m1",
    errors: { memberId: "That member is already linked to another staff login." },
  },
};
