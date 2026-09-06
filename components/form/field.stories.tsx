import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Input } from "@/components/ui/input";
import { FormSelect } from "./form-select";
import { Field } from "./field";

const meta: Meta<typeof Field> = {
  title: "UI/Field",
  component: Field,
  args: { label: "Full name", htmlFor: "fullName" },
  // `children` is supplied here rather than through args: Storybook expects args
  // to be JSON-serializable, and a React element is not.
  render: (args) => (
    <Field {...args}>
      <Input id="fullName" name="fullName" placeholder="Juan dela Cruz" />
    </Field>
  ),
};

export default meta;
type Story = StoryObj<typeof Field>;

export const Default: Story = {};

export const Required: Story = { args: { required: true } };

export const WithHint: Story = {
  args: { hint: "As it appears on their church record." },
};

/**
 * Errors come back from the server action's `XFormState`, so this is what a
 * failed `useActionState` round-trip renders. The error replaces the hint
 * rather than stacking under it: two lines of small text below one input is
 * where people stop reading.
 */
export const WithError: Story = {
  args: {
    hint: "As it appears on their church record.",
    error: "Full name is required.",
  },
};

/**
 * Selects go through `FormSelect`, not the raw Base UI `Select`. It is what
 * passes `name` (so the value reaches `FormData`) and `items` (so the trigger
 * shows a label instead of the stored value).
 */
export const WithSelect: Story = {
  args: { label: "Marital status", htmlFor: "maritalStatus" },
  render: (args) => (
    <Field {...args}>
      <FormSelect
        id="maritalStatus"
        name="maritalStatus"
        placeholder="Select status"
        clearLabel="Not recorded"
        options={[
          { value: "single", label: "Single" },
          { value: "married", label: "Married" },
          { value: "widowed", label: "Widowed" },
        ]}
      />
    </Field>
  ),
};

export const FormRow: Story = {
  parameters: { layout: "fullscreen" },
  render: () => (
    <form className="grid max-w-2xl gap-4 sm:grid-cols-2">
      <Field label="Full name" htmlFor="a" required>
        <Input id="a" name="fullName" defaultValue="Ana Reyes" />
      </Field>
      <Field label="Contact number" htmlFor="b" hint="Mobile or landline.">
        <Input id="b" name="contactNumber" placeholder="+63 917 000 0000" />
      </Field>
      <Field label="Birthdate" htmlFor="c" error="Enter a valid date.">
        <Input id="c" name="birthdate" type="date" defaultValue="not-a-date" />
      </Field>
      <Field label="Occupation" htmlFor="d">
        <Input id="d" name="occupation" />
      </Field>
    </form>
  ),
};
