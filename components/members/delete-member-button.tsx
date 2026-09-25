"use client";

import { useActionState } from "react";
import { Loader2, Trash2 } from "lucide-react";

import type { DeleteMemberResult } from "@/app/(app)/members/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Deletes a member after a confirmation. On success the action redirects to
 * the directory; the one refusal it reports is a face that face recognition
 * could not remove, which is shown here and leaves the member in place.
 */
export function DeleteMemberButton({
  id,
  name,
  deleteMember,
}: {
  id: string;
  name: string;
  deleteMember: (id: string) => Promise<DeleteMemberResult>;
}) {
  const [state, action, pending] = useActionState<DeleteMemberResult>(
    () => deleteMember(id),
    undefined,
  );

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Trash2 className="size-4" />
        Delete
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete member?</DialogTitle>
          <DialogDescription>
            This permanently removes <strong>{name}</strong>, all of their
            attendance records, and their face for check-in if they have one.
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {state?.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <form action={action}>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Delete member
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
