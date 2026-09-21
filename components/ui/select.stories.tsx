import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

const items = [
  { value: "admin", label: "Administrator" },
  { value: "leader", label: "Leader" },
  { value: "usher", label: "Usher" },
];

/** Use FormSelect for application forms; this documents the underlying primitive. */
const meta = {
  title: "UI/Select",
  component: Select,
  args: { items, name: "role" },
  render: (args) => (
    <Select {...args}>
      <SelectTrigger aria-label="Staff role" className="w-56">
        <SelectValue placeholder="Select role" />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  ),
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithValue: Story = { args: { defaultValue: "admin" } };
export const Disabled: Story = { args: { disabled: true, defaultValue: "usher" } };
export const Open: Story = { args: { defaultOpen: true, defaultValue: "leader" } };
