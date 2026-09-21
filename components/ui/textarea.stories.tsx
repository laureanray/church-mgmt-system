import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Field } from "@/components/form/field";
import { Textarea } from "./textarea";

const meta = {
  title: "UI/Textarea",
  component: Textarea,
  args: { id: "notes", name: "notes", placeholder: "Add a note for the team…" },
  render: (args) => (
    <Field label="Notes" htmlFor={args.id} className="max-w-sm">
      <Textarea {...args} />
    </Field>
  ),
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithValue: Story = {
  args: { defaultValue: "Please contact the cell leader before the next service." },
};
export const Disabled: Story = {
  args: { disabled: true, defaultValue: "This record is read-only." },
};
export const WithError: Story = {
  render: (args) => (
    <Field label="Notes" htmlFor={args.id} error="Keep notes under 500 characters." className="max-w-sm">
      <Textarea {...args} />
    </Field>
  ),
};
