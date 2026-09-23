import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { Member } from "@/db/schema";
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

const member: Member = {
  id: "sample-member", qrToken: "sample-token", fullName: "Juan Miguel Reyes Dela Cruz",
  firstName: "Juan Miguel", middleName: "Reyes", lastName: "Dela Cruz",
  birthdate: null, spiritualBirthday: null, memberSinceYear: null,
  gender: null, maritalStatus: null, status: "active", spouseName: null, weddingAnniversary: null,
  contactNumber: null, homeAddress: null, motherName: null, fatherName: null,
  educationalLevel: null, occupation: null, cellGroupId: null, userId: null,
  createdAt: new Date("2026-01-01T00:00:00Z"), updatedAt: new Date("2026-01-01T00:00:00Z"),
};

/** Name parts round-trip without guessing boundaries in compound names. */
export const EditMember: Story = {
  render: () => <div className="mx-auto max-w-4xl p-6"><MemberForm member={member} cellOptions={[]} action={async () => ({ message: "Preview only — no member was saved." })} /></div>,
};

/** Older records retain their original display name until staff confirm the parts. */
export const LegacyMember: Story = {
  render: () => <div className="mx-auto max-w-4xl p-6"><MemberForm member={{ ...member, firstName: null, middleName: null, lastName: null }} cellOptions={[]} action={async () => ({ message: "Preview only — no member was saved." })} /></div>,
};

/** Submit populated names to preview accessible server validation errors. */
export const NameErrors: Story = {
  render: () => <div className="mx-auto max-w-4xl p-6"><MemberForm member={member} cellOptions={[]} action={async () => ({ errors: { firstName: "Check the first name.", middleName: "Check the middle name.", lastName: "Check the last name." }, message: "Review the highlighted names." })} /></div>,
};

/** A delayed local action demonstrates the disabled saving button. */
export const Saving: Story = {
  render: () => <div className="mx-auto max-w-4xl p-6"><MemberForm member={member} cellOptions={[]} action={async () => { await new Promise((resolve) => setTimeout(resolve, 2000)); return { message: "Preview complete — no member was saved." }; }} /></div>,
};

/** A lapsed member keeps their status until staff change it here. */
export const InactiveMember: Story = {
  render: () => <div className="mx-auto max-w-4xl p-6"><MemberForm member={{ ...member, status: "inactive" }} cellOptions={[]} action={async () => ({ message: "Preview only — no member was saved." })} /></div>,
};

/** A rejected status is reported on the select, like every other field. */
export const StatusError: Story = {
  render: () => <div className="mx-auto max-w-4xl p-6"><MemberForm member={member} cellOptions={[]} action={async () => ({ errors: { status: "Choose a valid status" }, message: "Please fix the highlighted fields." })} /></div>,
};
