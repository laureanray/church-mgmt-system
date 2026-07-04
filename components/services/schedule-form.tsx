"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2, Save } from "lucide-react";

import type { ScheduleFormState } from "@/app/(app)/services/schedules/actions";
import { Field } from "@/components/form/field";
import { FormSelect } from "@/components/form/form-select";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DAYS_OF_WEEK,
  SERVICE_TYPES,
  SERVICE_TYPE_LABELS,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ServiceSchedule } from "@/db/schema";

const TYPE_OPTIONS = SERVICE_TYPES.map((v) => ({
  value: v,
  label: SERVICE_TYPE_LABELS[v],
}));

const DAY_OPTIONS = DAYS_OF_WEEK.map((label, i) => ({
  value: String(i),
  label,
}));

type ScheduleAction = (
  state: ScheduleFormState,
  formData: FormData,
) => Promise<ScheduleFormState>;

export function ScheduleForm({
  action,
  schedule,
  submitLabel = "Save schedule",
}: {
  action: ScheduleAction;
  schedule?: ServiceSchedule;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState<
    ScheduleFormState,
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
            label="Schedule Name"
            htmlFor="name"
            required
            error={errors.name}
            className="sm:col-span-2"
          >
            <Input
              id="name"
              name="name"
              defaultValue={schedule?.name ?? ""}
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
              defaultValue={schedule?.type ?? "sunday_service"}
              required
            />
          </Field>

          <Field
            label="Repeats On"
            htmlFor="dayOfWeek"
            required
            error={errors.dayOfWeek}
            hint="Every week on this day"
          >
            <FormSelect
              id="dayOfWeek"
              name="dayOfWeek"
              placeholder="Select day"
              options={DAY_OPTIONS}
              defaultValue={
                schedule ? String(schedule.dayOfWeek) : undefined
              }
              required
            />
          </Field>

          <Field
            label="Time"
            htmlFor="timeOfDay"
            required
            error={errors.timeOfDay}
          >
            <Input
              id="timeOfDay"
              name="timeOfDay"
              type="time"
              defaultValue={schedule?.timeOfDay ?? "09:00"}
              required
            />
          </Field>

          <Field
            label="Location"
            htmlFor="location"
            error={errors.location}
          >
            <Input
              id="location"
              name="location"
              defaultValue={schedule?.location ?? ""}
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
              defaultValue={schedule?.notes ?? ""}
              placeholder="Optional details"
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Link
          href="/services"
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
