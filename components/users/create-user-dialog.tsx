"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { createUser, type UserFormState } from "@/app/(app)/users/actions";
import { Field } from "@/components/form/field";
import { FormSelect } from "@/components/form/form-select";
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
import { USER_ROLES, USER_ROLE_LABELS } from "@/lib/constants";

const ROLE_OPTIONS = USER_ROLES.map((v) => ({
  value: v,
  label: USER_ROLE_LABELS[v],
}));

export function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [state, formAction, pending] = useActionState<UserFormState, FormData>(
    createUser,
    undefined,
  );
  const errors = state?.errors ?? {};

  useEffect(() => {
    if (state?.ok) {
      toast.success("Staff user created");
      setOpen(false);
      setFormKey((k) => k + 1);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <UserPlus className="size-4" />
        Add Staff
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add staff user</DialogTitle>
          <DialogDescription>
            Create a login for a church staff member and assign their role.
          </DialogDescription>
        </DialogHeader>
        <form key={formKey} action={formAction} className="space-y-4">
          <Field label="Full Name" htmlFor="user-name" required error={errors.name}>
            <Input id="user-name" name="name" required placeholder="Jane Cruz" />
          </Field>
          <Field label="Email" htmlFor="user-email" required error={errors.email}>
            <Input
              id="user-email"
              name="email"
              type="email"
              required
              placeholder="jane@church.local"
            />
          </Field>
          <Field
            label="Password"
            htmlFor="user-password"
            required
            error={errors.password}
            hint="At least 6 characters"
          >
            <Input
              id="user-password"
              name="password"
              type="password"
              required
            />
          </Field>
          <Field label="Role" htmlFor="user-role" required error={errors.role}>
            <FormSelect
              id="user-role"
              name="role"
              options={ROLE_OPTIONS}
              defaultValue="usher"
              placeholder="Select role"
              required
            />
          </Field>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
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
      </DialogContent>
    </Dialog>
  );
}
