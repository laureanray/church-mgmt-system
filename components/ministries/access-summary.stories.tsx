import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccessSummary } from "./access-summary";

const meta = {
  title: "Ministries/AccessSummary",
  component: AccessSummary,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Effective access</CardTitle>
        </CardHeader>
        <CardContent>
          <Story />
        </CardContent>
      </Card>
    ),
  ],
  args: {
    entries: [
      { permission: "dashboard.view", sources: [{ kind: "role", name: "Usher" }] },
      {
        permission: "services.view",
        sources: [
          { kind: "role", name: "Usher" },
          { kind: "ministry", id: "lam", name: "LAM" },
        ],
      },
      { permission: "lam.view", sources: [{ kind: "ministry", id: "lam", name: "LAM" }] },
      {
        permission: "lam.lineups_update",
        sources: [{ kind: "ministry", id: "lam", name: "LAM" }],
      },
    ],
  },
} satisfies Meta<typeof AccessSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A staff user's permissions, each credited to its role or ministries. */
export const WithSources: Story = {};

/** A ministry's own grants: no sources to show. */
export const GrantsOnly: Story = {
  args: {
    entries: [
      { permission: "services.view" },
      { permission: "attendance.view" },
      { permission: "attendance.record" },
    ],
  },
};

export const Empty: Story = {
  args: {
    entries: [],
    emptyTitle: "Grants no access",
    emptyDescription: "This ministry is a roster only.",
  },
};
