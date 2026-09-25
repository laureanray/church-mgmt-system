import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Checkbox } from "./checkbox";

/**
 * The shadcn Base UI checkbox. Pair it with a `<label htmlFor>` (or wrap it in
 * one) so the text is part of the click target and its accessible name.
 */
const meta: Meta<typeof Checkbox> = {
  title: "UI/Checkbox",
  component: Checkbox,
  args: { disabled: false, defaultChecked: false },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <label htmlFor="checkbox-default" className="flex items-center gap-2 text-sm">
      <Checkbox id="checkbox-default" {...args} />
      Ana Santos agrees to the notice
    </label>
  ),
};

export const Checked: Story = { ...Default, args: { defaultChecked: true } };

export const Disabled: Story = { ...Default, args: { disabled: true } };

export const Invalid: Story = {
  render: () => (
    <label htmlFor="checkbox-invalid" className="flex items-center gap-2 text-sm">
      <Checkbox id="checkbox-invalid" aria-invalid />
      Required before enrolling
    </label>
  ),
};
