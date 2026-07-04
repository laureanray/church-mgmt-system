"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2, Save } from "lucide-react";

import type { CellGroupFormState } from "@/app/(app)/cell-groups/actions";
import { Field } from "@/components/form/field";
import { FormSelect, type SelectOption } from "@/components/form/form-select";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MEETING_DAY_OPTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { CellGroup } from "@/db/schema";

type CellGroupAction = (
  state: CellGroupFormState,
  formData: FormData,
) => Promise<CellGroupFormState>;

export function CellGroupForm({
  action,
  cellGroup,
  memberOptions,
  cellOptions,
  submitLabel = "Save cell group",
}: {
  action: CellGroupAction;
  cellGroup?: CellGroup;
  memberOptions: SelectOption[];
  cellOptions: SelectOption[];
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState<
    CellGroupFormState,
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
        <CardHeader>
          <CardTitle className="text-base">Cell Group</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Name"
            htmlFor="name"
            required
            error={errors.name}
            className="sm:col-span-2"
          >
            <Input
              id="name"
              name="name"
              defaultValue={cellGroup?.name ?? ""}
              placeholder="e.g. Ana's Cell"
              required
            />
          </Field>

          <Field label="Leader" htmlFor="leaderId" error={errors.leaderId}>
            <FormSelect
              id="leaderId"
              name="leaderId"
              placeholder="Select a leader"
              options={memberOptions}
              defaultValue={cellGroup?.leaderId}
            />
          </Field>

          <Field
            label="Upline (parent cell group)"
            htmlFor="parentCellGroupId"
            hint="Whose network this cell sits under"
            error={errors.parentCellGroupId}
          >
            <FormSelect
              id="parentCellGroupId"
              name="parentCellGroupId"
              placeholder="None (top level)"
              options={cellOptions}
              defaultValue={cellGroup?.parentCellGroupId}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Meeting</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Day" htmlFor="meetingDay" error={errors.meetingDay}>
            <FormSelect
              id="meetingDay"
              name="meetingDay"
              placeholder="Select a day"
              options={MEETING_DAY_OPTIONS}
              defaultValue={
                cellGroup?.meetingDay != null
                  ? String(cellGroup.meetingDay)
                  : undefined
              }
            />
          </Field>

          <Field label="Time" htmlFor="meetingTime" error={errors.meetingTime}>
            <Input
              id="meetingTime"
              name="meetingTime"
              type="time"
              defaultValue={cellGroup?.meetingTime ?? ""}
            />
          </Field>

          <Field
            label="Location"
            htmlFor="meetingLocation"
            error={errors.meetingLocation}
            className="sm:col-span-2"
          >
            <Input
              id="meetingLocation"
              name="meetingLocation"
              defaultValue={cellGroup?.meetingLocation ?? ""}
              placeholder="e.g. Room 2 / a member's home"
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
              defaultValue={cellGroup?.notes ?? ""}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Link
          href={cellGroup ? `/cell-groups/${cellGroup.id}` : "/cell-groups"}
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
