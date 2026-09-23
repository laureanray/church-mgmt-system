import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { MEMBER_STATUSES, MEMBER_STATUS_LABELS } from "@/lib/constants";
import { MemberStatusBadge } from "./member-status-badge";

const meta = {
  title: "Members/MemberStatusBadge",
  component: MemberStatusBadge,
  args: { status: "visitor" },
  argTypes: {
    status: { control: "select", options: [...MEMBER_STATUSES] },
  },
} satisfies Meta<typeof MemberStatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Shown in the members table and on the member page, beside the name. */
export const Visitor: Story = {};

export const Inactive: Story = { args: { status: "inactive" } };

export const Transferred: Story = { args: { status: "transferred" } };

export const Deceased: Story = { args: { status: "deceased" } };

/** Active is the norm, so it renders nothing at all. */
export const Active: Story = { args: { status: "active" } };

/** Every status side by side, with the label for the one that draws no badge. */
export const AllStatuses: Story = {
  render: () => (
    <dl className="grid w-fit grid-cols-[auto_auto] items-center gap-x-6 gap-y-2 text-sm">
      {MEMBER_STATUSES.map((status) => (
        <React.Fragment key={status}>
          <dt className="text-muted-foreground">{MEMBER_STATUS_LABELS[status]}</dt>
          <dd>
            <MemberStatusBadge status={status} />
            {status === "active" ? (
              <span className="text-muted-foreground">No badge</span>
            ) : null}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  ),
};

/** In a table row next to the name, the way `/members` shows it. */
export const BesideName: Story = {
  render: () => (
    <ul className="w-72 divide-y rounded-md border text-sm">
      {(
        [
          ["Ana Reyes", "active"],
          ["Ben Cruz", "visitor"],
          ["Dennis Santos", "inactive"],
        ] as const
      ).map(([name, status]) => (
        <li key={name} className="flex items-center gap-2 px-3 py-2 font-medium">
          {name}
          <MemberStatusBadge status={status} />
        </li>
      ))}
    </ul>
  ),
};
