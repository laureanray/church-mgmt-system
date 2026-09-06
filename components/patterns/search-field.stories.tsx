import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { SearchField } from "./search-field";

const meta = {
  title: "Patterns/SearchField",
  component: SearchField,
  args: {
    placeholder: "Search by name…",
    label: "Search members by name",
  },
} satisfies Meta<typeof SearchField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * The field is populated from the URL, not from component state — the page read
 * `?q=` on the server and passed it back. That is what makes a search result
 * linkable and survivable across a refresh.
 */
export const WithActiveQuery: Story = {
  args: { defaultValue: "Santos" },
};
