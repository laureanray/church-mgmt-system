"use client";

import { useActionState } from "react";
import { KeyRound, Loader2 } from "lucide-react";

import {
  resetUserPassword,
  type ResetPasswordState,
} from "@/app/(app)/users/actions";
import { TempPasswordReveal } from "@/components/users/temp-password-reveal";
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

// Kept in its own component so it remounts (fresh action state) each time the
// dialog opens.
function ResetInner({ id, name }: { id: string; name: string }) {
  const action = resetUserPassword.bind(null, id);
  const [state, formAction, pending] = useActionState<
    ResetPasswordState,
    FormData
  >(action, undefined);

  if (state?.tempPassword) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>New temporary password</DialogTitle>
          <DialogDescription>
            Share this with <strong>{name}</strong>. They&apos;ll set a new one
            at next sign-in.
          </DialogDescription>
        </DialogHeader>
        <TempPasswordReveal
          username={state.username}
          tempPassword={state.tempPassword}
        />
        <DialogFooter>
          <DialogClose render={<Button />}>Done</DialogClose>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Reset password?</DialogTitle>
        <DialogDescription>
          This generates a new temporary password for <strong>{name}</strong>{" "}
          and requires them to change it at next sign-in. Their current password
          stops working.
        </DialogDescription>
      </DialogHeader>
      <form action={formAction}>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>
            Cancel
          </DialogClose>
          <Button type="submit" disabled={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <KeyRound className="size-4" />
            )}
            Reset password
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function ResetPasswordButton({
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
        aria-label={`Reset password for ${name}`}
      >
        <KeyRound className="size-4" />
      </DialogTrigger>
      <DialogContent>
        <ResetInner id={id} name={name} />
      </DialogContent>
    </Dialog>
  );
}
