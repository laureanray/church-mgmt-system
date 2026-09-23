"use client";

import { useFormStatus } from "react-dom";
import { Loader2, Trash2 } from "lucide-react";

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

function ConfirmButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
      {label}
    </Button>
  );
}

/**
 * A destructive action behind a confirmation dialog, submitted as a form so it
 * calls a server action directly.
 *
 * `trigger="icon"` is the ghost icon a table row uses; `"button"` is the
 * labelled outline button on a record's own page. Either way the trigger's
 * accessible name is "Delete <name>".
 */
export function ConfirmDeleteButton({
  name,
  title,
  description,
  confirmLabel = "Delete",
  trigger = "icon",
  action,
}: {
  name: string;
  title: string;
  description: string;
  confirmLabel?: string;
  trigger?: "icon" | "button";
  action: () => Promise<void>;
}) {
  return (
    <Dialog>
      {trigger === "icon" ? (
        <DialogTrigger
          render={<Button variant="ghost" size="icon-sm" />}
          aria-label={`Delete ${name}`}
        >
          <Trash2 className="size-4 text-destructive" />
        </DialogTrigger>
      ) : (
        <DialogTrigger
          render={<Button variant="outline" />}
          aria-label={`Delete ${name}`}
        >
          <Trash2 className="size-4" />
          Delete
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <form action={action}>
            <ConfirmButton label={confirmLabel} />
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
