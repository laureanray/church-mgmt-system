import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MemberMinistries } from "./member-ministries";

const meta = {
  title: "Ministries/MemberMinistries",
  component: MemberMinistries,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <Card className="max-w-xs">
        <CardHeader>
          <CardTitle className="text-base">Ministries</CardTitle>
        </CardHeader>
        <CardContent>
          <Story />
        </CardContent>
      </Card>
    ),
  ],
  args: {
    ministries: [
      { id: "lam", name: "LAM", position: "head", active: true },
      { id: "ushering", name: "Ushering", position: "member", active: true },
      { id: "prayer", name: "Prayer Ministry", position: "member", active: false },
    ],
    linkableIds: ["lam", "ushering", "prayer"],
  },
} satisfies Meta<typeof MemberMinistries>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A viewer who can open only the ministries they serve in. */
export const PartlyLinkable: Story = { args: { linkableIds: ["lam"] } };

export const None: Story = { args: { ministries: [] } };
