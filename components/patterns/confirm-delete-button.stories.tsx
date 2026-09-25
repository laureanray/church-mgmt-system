import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ComponentProps } from "react";

import { ConfirmDeleteButton } from "./confirm-delete-button";

// The action is a server action in the app; here it only resolves, so the
// dialog can be opened and confirmed without a backend.
function ConfirmDeleteButtonStory(
  props: Omit<ComponentProps<typeof ConfirmDeleteButton>, "action">,
) {
  return <ConfirmDeleteButton {...props} action={async () => undefined} />;
}

const meta = {
  title: "Patterns/ConfirmDeleteButton",
  component: ConfirmDeleteButtonStory,
  args: {
    name: "Children's Ministry",
    title: "Delete “Children's Ministry”?",
    description:
      "This removes the ministry, its roster, and the access it grants. Member records are kept.",
    confirmLabel: "Delete ministry",
  },
} satisfies Meta<typeof ConfirmDeleteButtonStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The ghost icon used in a table's actions column. */
export const RowIcon: Story = {};

/** The labelled button used in a record's page header. */
export const HeaderButton: Story = { args: { trigger: "button" } };
