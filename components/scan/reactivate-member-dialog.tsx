"use client";

import { useTransition } from "react";
import { Loader2, UserCheck } from "lucide-react";
import { toast } from "sonner";

import type { ReactivateResult } from "@/app/(app)/members/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MEMBER_STATUS_LABELS, type MemberStatus } from "@/lib/constants";

/** A check-in that just landed for someone whose status says they had left. */
export type LapsedCheckIn = {
  memberId: string;
  memberName: string;
  status: MemberStatus;
};

/**
 * Asked after a lapsed member has been checked in, never before: the check-in
 * stands either way, and the usher at the door should not be blocked on a
 * records question. Declining leaves the status alone.
 */
export function ReactivateMemberDialog({
  checkIn,
  reactivate,
  onReactivated,
  onClose,
}: {
  /** `null` keeps the dialog closed. */
  checkIn: LapsedCheckIn | null;
  reactivate: (memberId: string) => Promise<ReactivateResult>;
  /**
   * Called once the member really is active, so whatever showed their old
   * status — the check-in feed — stops contradicting the toast.
   */
  onReactivated?: (memberId: string) => void;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function confirm() {
    if (!checkIn) return;
    startTransition(async () => {
      try {
        const result = await reactivate(checkIn.memberId);
        if (result.status === "ok") {
          onReactivated?.(checkIn.memberId);
          toast.success(`${checkIn.memberName} is active again`);
        } else {
          toast.error(result.message);
        }
      } catch {
        toast.error("Something went wrong updating the member");
      }
      onClose();
    });
  }

  return (
    <Dialog
      open={checkIn !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      {checkIn ? (
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Mark as active again?</DialogTitle>
            <DialogDescription>
              <strong className="font-medium text-foreground">
                {checkIn.memberName}
              </strong>{" "}
              is checked in, but their record still lists them as{" "}
              {MEMBER_STATUS_LABELS[checkIn.status].toLowerCase()}. Marking
              them active puts them back in the directory, the member count and
              reports.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={<Button variant="outline" disabled={pending} />}
            >
              Keep as {MEMBER_STATUS_LABELS[checkIn.status].toLowerCase()}
            </DialogClose>
            <Button onClick={confirm} disabled={pending}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UserCheck className="size-4" />
              )}
              Mark as active
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
