import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Field } from "./field";
import { FormSelect } from "./form-select";

const meta = {
  title: "UI/FormSelect",
  component: FormSelect,
  args: {
    id: "marital-status",
    name: "maritalStatus",
    placeholder: "Select status",
    options: [
      { value: "single", label: "Single" },
      { value: "married", label: "Married" },
      { value: "widowed", label: "Widowed" },
    ],
  },
  render: (args) => (
    <Field label="Marital status" htmlFor={args.id} required={args.required} className="max-w-sm">
      <FormSelect {...args} />
    </Field>
  ),
} satisfies Meta<typeof FormSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** The displayed label differs from the value submitted through FormData. */
export const WithValue: Story = { args: { defaultValue: "married" } };
/** Optional fields need a selectable empty value so a recorded value can be cleared. */
export const Optional: Story = {
  args: { defaultValue: "married", clearLabel: "Not recorded" },
};
export const Required: Story = { args: { required: true } };
export const WithError: Story = {
  render: (args) => (
    <Field label="Marital status" htmlFor={args.id} error="Choose a marital status." className="max-w-sm">
      <FormSelect {...args} />
    </Field>
  ),
};
