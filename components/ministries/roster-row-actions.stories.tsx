import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ComponentProps } from "react";

import { RosterRowActions } from "./roster-row-actions";

function RosterRowActionsStory(
  props: Omit<
    ComponentProps<typeof RosterRowActions>,
    "togglePositionAction" | "removeAction"
  >,
) {
  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 600));
  return (
    <div className="w-72">
      <RosterRowActions {...props} togglePositionAction={wait} removeAction={wait} />
    </div>
  );
}

const meta = {
  title: "Ministries/RosterRowActions",
  component: RosterRowActionsStory,
  parameters: { layout: "padded" },
  args: {
    name: "Maria Santos",
    position: "member",
    canAppoint: true,
    canRemove: true,
  },
} satisfies Meta<typeof RosterRowActionsStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** What staff with `ministries.update` see. */
export const Administrator: Story = {};

export const OnAHead: Story = { args: { position: "head" } };

/** A ministry head: can remove members, cannot appoint heads. */
export const MinistryHead: Story = { args: { canAppoint: false } };

/** A plain roster member sees no controls at all. */
export const ReadOnly: Story = { args: { canAppoint: false, canRemove: false } };
