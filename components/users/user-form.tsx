"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2, Save } from "lucide-react";

import type { EditUserState } from "@/app/(app)/users/actions";
import { Field } from "@/components/form/field";
import { FormSelect, type SelectOption } from "@/components/form/form-select";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { User } from "@/db/schema";

type UserAction = (
  state: EditUserState,
  formData: FormData,
) => Promise<EditUserState>;

export function UserForm({
  action,
  user,
  roles,
  memberOptions,
  memberId = null,
}: {
  action: UserAction;
  user: User;
  roles: { value: string; label: string }[];
  /** Members this login may be linked to: unlinked ones, plus its own. */
  memberOptions: SelectOption[];
  memberId?: string | null;
}) {
  const [state, formAction, pending] = useActionState<EditUserState, FormData>(
    action,
    undefined,
  );
  const errors = state?.errors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      {state?.message ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.message}
        </div>
      ) : null}

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Full Name"
            htmlFor="name"
            required
            error={errors.name}
            className="sm:col-span-2"
          >
            <Input id="name" name="name" defaultValue={user.name} required />
          </Field>

          <Field
            label="Email"
            htmlFor="email"
            required
            error={errors.email}
            hint="Used to sign in"
          >
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={user.email}
              autoCapitalize="none"
              required
            />
          </Field>

          <Field label="Role" htmlFor="roleId" required error={errors.roleId}>
            <FormSelect
              id="roleId"
              name="roleId"
              options={roles}
              defaultValue={user.roleId}
              required
            />
          </Field>

          <Field
            label="Member Record"
            htmlFor="memberId"
            error={errors.memberId}
            hint="Ministry access reaches a login through its member record."
            className="sm:col-span-2"
          >
            <FormSelect
              id="memberId"
              name="memberId"
              options={memberOptions}
              defaultValue={memberId ?? ""}
              clearLabel="Not linked"
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Link
          href="/users"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Cancel
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save changes
        </Button>
      </div>
    </form>
  );
}
