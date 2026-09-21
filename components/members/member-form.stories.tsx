import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MemberForm } from "./member-form";

const meta: Meta<typeof MemberForm> = {
  title: "Members/MemberForm", component: MemberForm,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof meta>;

/** Complete form using local fixtures; submission never writes a member. */
export const NewMember: Story = {
  render: () => <div className="mx-auto max-w-4xl p-6"><MemberForm cellOptions={[{ value: "sample-cell", label: "San Isidro" }]} action={async () => ({ message: "Preview only — no member was saved." })} /></div>,
};
export const DateErrors: Story = {
  render: () => <div className="mx-auto max-w-4xl p-6"><MemberForm cellOptions={[]} action={async () => ({ errors: { birthdate: "Check the member’s birthdate.", spiritualBirthday: "Check the baptism date." }, message: "Review the highlighted dates." })} /></div>,
};
