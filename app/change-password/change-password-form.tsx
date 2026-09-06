"use client";

import { useActionState } from "react";
import { KeyRound, Loader2 } from "lucide-react";

import { changeOwnPassword, type ChangePasswordState } from "./actions";
import { Field } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<
    ChangePasswordState,
    FormData
  >(changeOwnPassword, undefined);
  const errors = state?.errors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      {state?.message ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.message}
        </div>
      ) : null}

      <Field
        label="New Password"
        htmlFor="password"
        required
        error={errors.password}
        hint="At least 8 characters"
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
        />
      </Field>

      <Field
        label="Confirm New Password"
        htmlFor="confirmPassword"
        required
        error={errors.confirmPassword}
      >
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <KeyRound className="size-4" />
        )}
        Set new password
      </Button>
    </form>
  );
}
