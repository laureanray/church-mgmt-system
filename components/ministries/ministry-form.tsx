"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2, Save } from "lucide-react";

import type { MinistryFormState } from "@/app/(app)/ministries/actions";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { PermissionKey } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type MinistryAction = (
  state: MinistryFormState,
  formData: FormData,
) => Promise<MinistryFormState>;

/**
 * Create or edit a ministry: its details, and the permissions every member of
 * its roster receives on top of their role — provided their member record is
 * linked to a staff login.
 */
export function MinistryForm({
  action,
  ministry,
  selectedPermissions = [],
  cancelHref = "/ministries",
}: {
  action: MinistryAction;
  ministry?: { name: string; description: string | null; active: boolean };
  selectedPermissions?: readonly PermissionKey[];
  cancelHref?: string;
}) {
  const [state, formAction, pending] = useActionState<
    MinistryFormState,
    FormData
  >(action, undefined);
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
          <CardTitle>Ministry details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field label="Ministry Name" htmlFor="name" required error={errors.name}>
            <Input
              id="name"
              name="name"
              defaultValue={ministry?.name}
              placeholder="Ushering"
              required
            />
          </Field>
          <Field
            label="Description"
            htmlFor="description"
            error={errors.description}
          >
            <Textarea
              id="description"
              name="description"
              defaultValue={ministry?.description ?? ""}
              rows={3}
            />
          </Field>
          <div className="flex items-start gap-3">
            <Switch
              id="active"
              name="active"
              defaultChecked={ministry?.active ?? true}
              className="mt-0.5"
              aria-describedby="active-hint"
            />
            <div className="space-y-0.5">
              <Label htmlFor="active">Active</Label>
              <p id="active-hint" className="text-xs text-muted-foreground">
                An inactive ministry keeps its roster but grants no access.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Access granted to members</CardTitle>
          <CardDescription>
            Added to each member&apos;s role when their member record is linked
            to a staff login. Staff, role, ministry and settings administration
            can only come from a role.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errors.permissions ? (
            <p role="alert" className="mb-3 text-xs font-medium text-destructive">
              {errors.permissions}
            </p>
          ) : null}
          <PermissionMatrix selected={selectedPermissions} scope="ministry" />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Link href={cancelHref} className={cn(buttonVariants({ variant: "outline" }))}>
          Cancel
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save ministry
        </Button>
      </div>
    </form>
  );
}
