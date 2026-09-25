"use client";

import { startTransition, useActionState, useEffect } from "react";
import { Loader2, UserPlus } from "lucide-react";

import type { AddVisitorState } from "@/app/(app)/scan/actions";
import { Field } from "@/components/form/field";
import { FacePhotoField } from "@/components/members/face-photo-field";
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
import { Input } from "@/components/ui/input";
import type { CheckIn } from "@/server/attendance";

type AddVisitorAction = (
  prev: AddVisitorState,
  formData: FormData,
) => Promise<AddVisitorState>;

/**
 * A first-time visitor at the door: a name (and a number, if they give one),
 * and — with their consent — a photo, so the camera knows them next time.
 * Saving creates them as a visitor and checks them in to the selected service.
 *
 * Search by name first: the description says so, because adding someone who
 * is already in the directory makes a duplicate.
 */
export function AddVisitorDialog({
  open,
  onOpenChange,
  action,
  face,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bound to the selected service by the caller. */
  action: AddVisitorAction;
  /** Offer a photo, with the consent notice; only when face check-in is on. */
  face?: { notice: string };
  onAdded: (checkIn: CheckIn) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        {/* Remounted on every open, so each visitor starts from a blank form. */}
        {open ? (
          <VisitorForm
            action={action}
            face={face}
            onAdded={(checkIn) => {
              onAdded(checkIn);
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function VisitorForm({
  action,
  face,
  onAdded,
}: {
  action: AddVisitorAction;
  face?: { notice: string };
  onAdded: (checkIn: CheckIn) => void;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const errors = state?.status === "error" ? (state.errors ?? {}) : {};

  useEffect(() => {
    if (state?.status === "ok") onAdded(state.checkIn);
    // onAdded closes the dialog; it only needs to run for a new result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const failure = state?.status === "error" ? state.message : null;

  return (
    <form
      // Submitted by hand rather than with `action`: React resets a form after
      // its action finishes, which would clear what was typed — and the photo —
      // whenever the server sends back an error.
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => formAction(formData));
      }}
      className="grid gap-4"
    >
      <DialogHeader>
        <DialogTitle>Add a first-time visitor</DialogTitle>
        <DialogDescription>
          Search by name first — they may already be in the directory. Saving
          adds them as a visitor and checks them in.
        </DialogDescription>
      </DialogHeader>

      {failure ? (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="visitor-first-name" error={errors.firstName} required>
          <Input id="visitor-first-name" name="firstName" autoComplete="off" required />
        </Field>
        <Field label="Last name" htmlFor="visitor-last-name" error={errors.lastName} required>
          <Input id="visitor-last-name" name="lastName" autoComplete="off" required />
        </Field>
        <Field
          label="Contact number"
          htmlFor="visitor-contact"
          error={errors.contactNumber}
          hint="Optional"
          className="sm:col-span-2"
        >
          <Input id="visitor-contact" name="contactNumber" type="tel" placeholder="0917-123-4567" />
        </Field>
      </div>

      {face ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Face check-in</p>
          <FacePhotoField
            notice={face.notice}
            errors={{ facePhoto: errors.facePhoto, faceConsent: errors.faceConsent }}
            disabled={pending}
          />
        </div>
      ) : null}

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />} disabled={pending}>
          Cancel
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
          Add and check in
        </Button>
      </DialogFooter>
    </form>
  );
}
