import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ComponentProps } from "react";

import type { MinistryFormState } from "@/app/(app)/ministries/actions";
import { MinistryForm } from "./ministry-form";

function MinistryFormStory({
  result,
  ...props
}: Omit<ComponentProps<typeof MinistryForm>, "action"> & {
  /** What the stand-in server action returns when the form is submitted. */
  result?: MinistryFormState;
}) {
  return <MinistryForm {...props} action={async () => result} />;
}

const meta = {
  title: "Ministries/MinistryForm",
  component: MinistryFormStory,
  parameters: { layout: "padded" },
} satisfies Meta<typeof MinistryFormStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {};

export const Edit: Story = {
  args: {
    ministry: {
      name: "Ushering",
      description: "Welcomes people and records attendance at every service.",
      active: true,
    },
    selectedPermissions: ["services.view", "attendance.view", "attendance.record"],
    cancelHref: "/ministries/ushering",
  },
};

export const Inactive: Story = {
  args: {
    ministry: { name: "Prayer Ministry", description: null, active: false },
  },
};

/** Submit to see a server-side validation error land on the name field. */
export const DuplicateName: Story = {
  args: {
    ministry: { name: "LAM", description: null, active: true },
    result: { errors: { name: "That ministry name is already in use." } },
  },
};

/**
 * Edited by someone who does not hold every ministry-grantable permission:
 * those boxes are locked in their saved state, so the ministry keeps granting
 * Plan line-ups even though this editor could not give it.
 */
export const LimitedEditor: Story = {
  args: {
    ministry: { name: "LAM", description: "Liturgy, Arts, and Music.", active: true },
    selectedPermissions: ["lam.view", "lam.lineups_update"],
    grantable: ["dashboard.view", "members.view", "services.view", "lam.view"],
    permissionsNote:
      "Permissions you do not hold yourself are locked: you can neither grant nor remove them.",
  },
};
