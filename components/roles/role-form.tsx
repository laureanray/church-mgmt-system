"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2, Save } from "lucide-react";

import type { RoleFormState } from "@/app/(app)/roles/actions";
import { Field } from "@/components/form/field";
import { PermissionMatrix } from "@/components/roles/permission-matrix";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PermissionKey } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type RoleAction = (
  state: RoleFormState,
  formData: FormData,
) => Promise<RoleFormState>;

export function RoleForm({
  action,
  role,
  selectedPermissions = [],
  protectedRole = false,
  grantable,
  permissionsNote,
}: {
  action: RoleAction;
  role?: { name: string; description: string | null };
  selectedPermissions?: readonly PermissionKey[];
  protectedRole?: boolean;
  /** The permissions this editor may change; the rest are locked. */
  grantable?: readonly PermissionKey[];
  /** Why some permissions are locked, shown above the matrix. */
  permissionsNote?: string;
}) {
  const [state, formAction, pending] = useActionState<RoleFormState, FormData>(
    action,
    undefined,
  );
  const errors = state?.errors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      {state?.message ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.message}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Role details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Role Name" htmlFor="name" required error={errors.name}>
            <Input
              id="name"
              name="name"
              defaultValue={role?.name}
              disabled={protectedRole}
              required
            />
          </Field>
          <Field
            label="Description"
            htmlFor="description"
            error={errors.description}
            className="sm:col-span-2"
          >
            <Textarea
              id="description"
              name="description"
              defaultValue={role?.description ?? ""}
              disabled={protectedRole}
              rows={3}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Module permissions</CardTitle>
          {permissionsNote ? (
            <CardDescription>{permissionsNote}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          <PermissionMatrix
            selected={selectedPermissions}
            disabled={protectedRole}
            grantable={grantable}
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Link href="/roles" className={cn(buttonVariants({ variant: "outline" }))}>
          {protectedRole ? "Back" : "Cancel"}
        </Link>
        {protectedRole ? null : (
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save role
          </Button>
        )}
      </div>
    </form>
  );
}
