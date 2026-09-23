import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { ReactivateResult } from "@/app/(app)/members/actions";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import type { MemberStatus } from "@/lib/constants";
import { ReactivateMemberDialog } from "./reactivate-member-dialog";

const meta: Meta<typeof ReactivateMemberDialog> = {
  title: "Scan/ReactivateMemberDialog",
  component: ReactivateMemberDialog,
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Stories drive the dialog with a local fake in place of the server action, so
 * nothing is written. "Check in again" reopens it after a choice.
 */
function Preview({
  status = "inactive",
  reactivate = async () => ({ status: "ok" }),
}: {
  status?: MemberStatus;
  reactivate?: (memberId: string) => Promise<ReactivateResult>;
}) {
  const [open, setOpen] = React.useState(true);
  return (
    <div className="p-6">
      <Button variant="outline" onClick={() => setOpen(true)}>
        Check in again
      </Button>
      <ReactivateMemberDialog
        checkIn={
          open
            ? { memberId: "sample-member", memberName: "Dennis Santos", status }
            : null
        }
        reactivate={reactivate}
        onClose={() => setOpen(false)}
      />
      <Toaster />
    </div>
  );
}

/** The usual case: someone who had stopped attending walks back in. */
export const Inactive: Story = {
  render: () => <Preview />,
};

export const Transferred: Story = {
  render: () => <Preview status="transferred" />,
};

/** Most likely a mistaken identity, which is why the check-in names the status. */
export const Deceased: Story = {
  render: () => <Preview status="deceased" />,
};

/** Both buttons disable while the update is in flight. */
export const Reactivating: Story = {
  render: () => (
    <Preview
      reactivate={async () => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return { status: "ok" };
      }}
    />
  ),
};

/** Someone else changed the record first; the dialog closes with an error toast. */
export const Failed: Story = {
  render: () => (
    <Preview
      reactivate={async () => ({
        status: "error",
        message: "This member’s status has already changed.",
      })}
    />
  ),
};
