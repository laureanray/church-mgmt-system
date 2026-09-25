import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { LinkTabs } from "./link-tabs";

const meta = {
  title: "Patterns/LinkTabs",
  component: LinkTabs,
  args: {
    label: "Member record",
    tabs: [
      { href: "/members/1", label: "Attendance", count: 42, active: true },
      { href: "/members/1?tab=history", label: "History", count: 7 },
    ],
  },
} satisfies Meta<typeof LinkTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The member page: attendance by default, the audit history one link away. */
export const Default: Story = {};

/** The second tab selected — the URL carries `?tab=history`. */
export const SecondActive: Story = {
  args: {
    tabs: [
      { href: "/members/1", label: "Attendance", count: 42 },
      { href: "/members/1?tab=history", label: "History", count: 7, active: true },
    ],
  },
};

/** Counts are optional; a tab whose size is unknown or irrelevant omits it. */
export const WithoutCounts: Story = {
  args: {
    tabs: [
      { href: "/services/1", label: "Overview", active: true },
      { href: "/services/1?tab=attendance", label: "Attendance" },
      { href: "/services/1?tab=notes", label: "Notes" },
    ],
  },
};

/** An empty tab still shows its zero, so "nothing here" is known before a click. */
export const EmptyTab: Story = {
  args: {
    tabs: [
      { href: "/members/1", label: "Attendance", count: 0, active: true },
      { href: "/members/1?tab=history", label: "History", count: 0 },
    ],
  },
};

/** Narrow screens scroll the row sideways rather than wrapping it. */
export const Narrow: Story = {
  args: {
    tabs: [
      { href: "/x", label: "Attendance", count: 120, active: true },
      { href: "/x?tab=history", label: "History", count: 18 },
      { href: "/x?tab=cells", label: "Cell groups", count: 3 },
      { href: "/x?tab=notes", label: "Pastoral notes", count: 5 },
    ],
  },
  render: (args) => (
    <div className="w-64">
      <LinkTabs {...args} />
    </div>
  ),
};
