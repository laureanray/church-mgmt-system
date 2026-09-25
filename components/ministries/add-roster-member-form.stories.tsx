import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { RosterFormState } from "@/app/(app)/ministries/actions";
import type { SelectOption } from "@/components/form/form-select";
import { AddRosterMemberForm } from "./add-roster-member-form";

function AddRosterMemberFormStory({
  options,
  result,
}: {
  options: SelectOption[];
  result?: RosterFormState;
}) {
  return (
    <div className="max-w-md">
      <AddRosterMemberForm options={options} action={async () => result} />
    </div>
  );
}

const meta = {
  title: "Ministries/AddRosterMemberForm",
  component: AddRosterMemberFormStory,
  parameters: { layout: "padded" },
  args: {
    options: [
      { value: "m1", label: "Juan Dela Cruz" },
      { value: "m2", label: "Maria Santos" },
      { value: "m3", label: "Pedro Reyes" },
    ],
  },
} satisfies Meta<typeof AddRosterMemberFormStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Nobody left to add. */
export const EveryoneAdded: Story = { args: { options: [] } };

/** Submit to see the error the action returns when the member is already listed. */
export const AlreadyOnRoster: Story = {
  args: { result: { errors: { memberId: "Maria Santos is already on this roster." } } },
};
