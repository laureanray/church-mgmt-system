"use client";

import { useFormStatus } from "react-dom";
import { Loader2, Trash2 } from "lucide-react";

import { deleteSchedule } from "@/app/(app)/services/schedules/actions";
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
      Delete schedule
    </Button>
  );
}

export function DeleteScheduleButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  return (
    <Dialog>
      <DialogTrigger
        render={<Button variant="ghost" size="icon-sm" />}
        aria-label={`Delete ${name}`}
      >
        <Trash2 className="size-4 text-destructive" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete schedule?</DialogTitle>
          <DialogDescription>
            This stops generating new occurrences of <strong>{name}</strong>.
            Past services and their attendance are kept as standalone services.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <form action={deleteSchedule.bind(null, id)}>
            <ConfirmButton />
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
