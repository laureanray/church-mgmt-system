"use client";

import { useFormStatus } from "react-dom";
import { Loader2, Trash2 } from "lucide-react";

import { deleteUser } from "@/app/(app)/users/actions";
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

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" disabled={pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Trash2 className="size-4" />
      )}
      Remove user
    </Button>
  );
}

export function DeleteUserButton({
  id,
  name,
  currentUserId,
}: {
  id: string;
  name: string;
  currentUserId: string;
}) {
  return (
    <Dialog>
      <DialogTrigger
        render={<Button variant="ghost" size="icon-sm" />}
        aria-label={`Remove ${name}`}
      >
        <Trash2 className="size-4 text-destructive" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove staff user?</DialogTitle>
          <DialogDescription>
            <strong>{name}</strong> will lose access immediately. This cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <form action={deleteUser.bind(null, currentUserId, id)}>
            <ConfirmButton />
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
