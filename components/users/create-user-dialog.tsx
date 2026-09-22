"use client";

import { useActionState, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";

import type { CreateUserState } from "@/app/(app)/users/actions";
import { Field } from "@/components/form/field";
import { FormSelect } from "@/components/form/form-select";
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
import { Input } from "@/components/ui/input";
export function CreateUserDialog({
  roles,
  action,
}: {
  roles: { value: string; label: string }[];
  action: (
    state: CreateUserState,
    formData: FormData,
  ) => Promise<CreateUserState>;
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [state, formAction, pending] = useActionState<
    CreateUserState,
    FormData
  >(action, undefined);
  const errors = state?.errors ?? {};
  const created = Boolean(state?.ok && state?.tempPassword);

  function reset() {
    setOpen(false);
    // Remount fresh state next time it opens.
    setFormKey((k) => k + 1);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setFormKey((k) => k + 1);
      }}
    >
      <DialogTrigger render={<Button />}>
        <UserPlus className="size-4" />
        Add Staff
      </DialogTrigger>
      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Staff user created</DialogTitle>
              <DialogDescription>
                Give these credentials to <strong>{state?.email}</strong>.
              </DialogDescription>
            </DialogHeader>
            <TempPasswordReveal
              email={state!.email!}
              tempPassword={state!.tempPassword!}
            />
            <DialogFooter>
              <Button onClick={reset}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add staff user</DialogTitle>
              <DialogDescription>
                Create a login. A temporary password is generated for you to
                share; they&apos;ll set their own at first sign-in.
              </DialogDescription>
            </DialogHeader>
            <form key={formKey} action={formAction} className="space-y-4">
              <Field
                label="Full Name"
                htmlFor="user-name"
                required
                error={errors.name}
              >
                <Input
                  id="user-name"
                  name="name"
                  required
                  placeholder="Jane Cruz"
                />
              </Field>
              <Field
                label="Email"
                htmlFor="user-email"
                required
                error={errors.email}
                hint="Used to sign in"
              >
                <Input
                  id="user-email"
                  name="email"
                  type="email"
                  required
                  autoCapitalize="none"
                  autoComplete="off"
                  placeholder="jane@example.com"
                />
              </Field>
              <Field
                label="Role"
                htmlFor="user-roleId"
                required
                error={errors.roleId}
              >
                <FormSelect
                  id="user-roleId"
                  name="roleId"
                  options={roles}
                  defaultValue={roles.find((role) => role.value === "usher")?.value}
                  placeholder="Select role"
                  required
                />
              </Field>
              <DialogFooter>
                <DialogClose
                  render={<Button variant="outline" type="button" />}
                >
                  Cancel
                </DialogClose>
                <Button type="submit" disabled={pending}>
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <UserPlus className="size-4" />
                  )}
                  Create user
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
