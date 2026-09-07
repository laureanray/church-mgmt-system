import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Input } from "./input";

const meta = {
  title: "UI/Input",
  component: Input,
  args: { placeholder: "Juan dela Cruz", "aria-label": "Full name" },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithValue: Story = { args: { defaultValue: "Ana Reyes" } };
export const Disabled: Story = { args: { disabled: true, defaultValue: "Ana Reyes" } };

/**
 * Validation state is an ARIA attribute, not a class. `aria-invalid` is what
 * both the ring styling and the screen reader read, so setting one without the
 * other leaves the two disagreeing.
 */
export const Invalid: Story = {
  args: { "aria-invalid": true, defaultValue: "" },
};

export const Types: Story = {
  render: () => (
    <div className="grid max-w-sm gap-3">
      <Input type="email" placeholder="usher@church.local" aria-label="Email" />
      <Input type="password" defaultValue="hunter22" aria-label="Password" />
      <Input type="date" defaultValue="1988-03-14" aria-label="Birthdate" />
      <Input
        type="datetime-local"
        defaultValue="2026-09-07T09:00"
        aria-label="Scheduled at"
      />
    </div>
  ),
};
