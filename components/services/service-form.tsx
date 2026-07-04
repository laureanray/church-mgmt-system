"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2, Save } from "lucide-react";

import type { ServiceFormState } from "@/app/(app)/services/actions";
import { Field } from "@/components/form/field";
import { FormSelect } from "@/components/form/form-select";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SERVICE_TYPES, SERVICE_TYPE_LABELS } from "@/lib/constants";
import { toDateTimeLocal } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Service } from "@/db/schema";

const TYPE_OPTIONS = SERVICE_TYPES.map((v) => ({
  value: v,
  label: SERVICE_TYPE_LABELS[v],
}));

type ServiceAction = (
  state: ServiceFormState,
  formData: FormData,
) => Promise<ServiceFormState>;

export function ServiceForm({
  action,
  service,
  submitLabel = "Save service",
}: {
  action: ServiceAction;
  service?: Service;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState<
    ServiceFormState,
    FormData
  >(action, undefined);
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
            label="Service Name"
            htmlFor="name"
            required
            error={errors.name}
            className="sm:col-span-2"
          >
            <Input
              id="name"
              name="name"
              defaultValue={service?.name ?? ""}
              placeholder="e.g. Sunday Worship Service"
              required
            />
          </Field>

          <Field label="Type" htmlFor="type" required error={errors.type}>
            <FormSelect
              id="type"
              name="type"
              placeholder="Select type"
              options={TYPE_OPTIONS}
              defaultValue={service?.type ?? "sunday_service"}
              required
            />
          </Field>

          <Field
            label="Date & Time"
            htmlFor="scheduledAt"
            required
            error={errors.scheduledAt}
          >
            <Input
              id="scheduledAt"
              name="scheduledAt"
              type="datetime-local"
              defaultValue={
                service ? toDateTimeLocal(service.scheduledAt) : undefined
              }
              required
            />
          </Field>

          <Field
            label="Location"
            htmlFor="location"
            error={errors.location}
            className="sm:col-span-2"
          >
            <Input
              id="location"
              name="location"
              defaultValue={service?.location ?? ""}
              placeholder="e.g. Main Sanctuary"
            />
          </Field>

          <Field
            label="Notes"
            htmlFor="notes"
            error={errors.notes}
            className="sm:col-span-2"
          >
            <Textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={service?.notes ?? ""}
              placeholder="Optional details about this service"
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Link
          href={service ? `/services/${service.id}` : "/services"}
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
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
