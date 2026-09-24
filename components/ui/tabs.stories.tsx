import * as React from "react";
import Link from "next/link";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

const meta = {
  title: "UI/Tabs",
  component: Tabs,
  args: { defaultValue: "week" },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Panels switch in place; arrow keys move between tabs. */
export const Default: Story = {
  render: (args) => (
    <Tabs {...args}>
      <TabsList>
        <TabsTrigger value="week">Next 7 days</TabsTrigger>
        <TabsTrigger value="month">This month</TabsTrigger>
      </TabsList>
      <TabsContent value="week">Three celebrations this week.</TabsContent>
      <TabsContent value="month">Eleven celebrations this month.</TabsContent>
    </Tabs>
  ),
};

export const Line: Story = {
  render: (args) => (
    <Tabs {...args}>
      <TabsList variant="line">
        <TabsTrigger value="week">Next 7 days</TabsTrigger>
        <TabsTrigger value="month">This month</TabsTrigger>
      </TabsList>
      <TabsContent value="week">Three celebrations this week.</TabsContent>
      <TabsContent value="month">Eleven celebrations this month.</TabsContent>
    </Tabs>
  ),
};

export const Disabled: Story = {
  render: (args) => (
    <Tabs {...args}>
      <TabsList>
        <TabsTrigger value="week">Next 7 days</TabsTrigger>
        <TabsTrigger value="month">This month</TabsTrigger>
        <TabsTrigger value="year" disabled>
          This year
        </TabsTrigger>
      </TabsList>
      <TabsContent value="week">Three celebrations this week.</TabsContent>
    </Tabs>
  ),
};

/**
 * When the selected tab belongs in the URL, each trigger is a link (`render`
 * plus `nativeButton={false}`) and only the selected panel is rendered — the
 * page reads the value back from the query string. See
 * *Celebrations/CelebrationRangeTabs*.
 */
export const AsLinks: Story = {
  args: { value: "month", defaultValue: undefined },
  render: (args) => (
    <Tabs {...args}>
      <TabsList>
        <TabsTrigger
          value="week"
          nativeButton={false}
          render={<Link href="?range=week" />}
        >
          Next 7 days
        </TabsTrigger>
        <TabsTrigger
          value="month"
          nativeButton={false}
          render={<Link href="?range=month" />}
        >
          This month
        </TabsTrigger>
      </TabsList>
      <TabsContent value={args.value}>
        Only the selected panel exists.
      </TabsContent>
    </Tabs>
  ),
};
