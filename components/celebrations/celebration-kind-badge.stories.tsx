import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { CELEBRATION_KINDS } from "@/lib/celebrations";
import { CelebrationKindBadge } from "./celebration-kind-badge";

const meta = {
  title: "Celebrations/CelebrationKindBadge",
  component: CelebrationKindBadge,
  args: { kind: "birthday" },
  argTypes: {
    kind: { control: "select", options: [...CELEBRATION_KINDS] },
  },
} satisfies Meta<typeof CelebrationKindBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Birthday: Story = {};

export const SpiritualBirthday: Story = {
  args: { kind: "spiritual_birthday" },
};

export const WeddingAnniversary: Story = {
  args: { kind: "wedding_anniversary" },
};

/** Tone and icon both differ, so the kinds survive a greyscale print. */
export const AllKinds: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {CELEBRATION_KINDS.map((kind) => (
        <CelebrationKindBadge key={kind} kind={kind} />
      ))}
    </div>
  ),
};
