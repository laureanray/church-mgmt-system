import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { REDACTED } from "@/lib/audit-diff";
import { AuditChanges } from "./audit-changes";

const meta = {
  title: "Audit/AuditChanges",
  component: AuditChanges,
  args: {
    before: { contactNumber: "+63 917 555 0134" },
    after: { contactNumber: "+63 918 555 0177" },
  },
} satisfies Meta<typeof AuditChanges>;

export default meta;
type Story = StoryObj<typeof meta>;

/** An edit stores only the field that moved: old value struck, new beside it. */
export const SingleFieldEdit: Story = {};

export const SeveralFields: Story = {
  args: {
    before: { status: "inactive", homeAddress: null, occupation: "Teacher" },
    after: { status: "active", homeAddress: "Brgy. San Roque, Antipolo", occupation: "Principal" },
  },
};

/** A secret never reaches the log; the entry still says it was rotated. */
export const RedactedSecret: Story = {
  args: {
    before: { sheetsWebhookSecret: REDACTED },
    after: { sheetsWebhookSecret: REDACTED },
  },
};

/** A create keeps the whole new record, folded until someone opens it. */
export const Created: Story = {
  args: {
    before: null,
    after: {
      fullName: "Ana Reyes",
      firstName: "Ana",
      lastName: "Reyes",
      gender: "female",
      status: "visitor",
      contactNumber: "+63 917 555 0134",
      spouseName: null,
    },
  },
};

/** A delete keeps the record as it was, so what was lost is still on file. */
export const Deleted: Story = {
  args: {
    before: { name: "Youth Cell", active: true, memberIds: ["m1", "m2", "m3"] },
    after: null,
  },
};

/** A password reset records that it happened and nothing else. */
export const NoFields: Story = {
  args: { before: null, after: null },
};

/** Inside a narrow column, long values wrap rather than widen the table. */
export const Narrow: Story = {
  args: {
    before: { homeAddress: "Blk 12 Lot 4, Phase 2, Sampaguita Homes, Brgy. Dela Paz" },
    after: { homeAddress: "Unit 5B, Tower 3, Mabuhay Residences, Ortigas Ave. Extension" },
  },
  render: (args) => (
    <div className="w-56">
      <AuditChanges {...args} />
    </div>
  ),
};
