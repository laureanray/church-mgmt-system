"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, UserPlus, Users, X } from "lucide-react";

import type { LineupFormState } from "@/app/(app)/lam/actions";
import { Field } from "@/components/form/field";
import { FormSelect, type SelectOption } from "@/components/form/form-select";
import { EmptyState } from "@/components/patterns/empty-state";
import { Button } from "@/components/ui/button";
import {
  LINEUP_PARTS,
  LINEUP_PART_LABELS,
  type LineupPart,
} from "@/lib/constants";

export type TeamAssignment = {
  id: string;
  memberName: string;
  part: LineupPart;
};

const PART_OPTIONS = LINEUP_PARTS.map((part) => ({
  value: part,
  label: LINEUP_PART_LABELS[part],
}));

function RemoveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      disabled={pending}
      className="-my-0.5 -mr-1.5 text-muted-foreground hover:text-destructive"
    >
      {pending ? <Loader2 className="animate-spin" /> : <X />}
    </Button>
  );
}

function AddAssignmentForm({
  roster,
  action,
}: {
  roster: SelectOption[];
  action: (state: LineupFormState, formData: FormData) => Promise<LineupFormState>;
}) {
  const [formKey, setFormKey] = useState(0);
  const [state, formAction, pending] = useActionState<LineupFormState, FormData>(
    async (previous, formData) => {
      const result = await action(previous, formData);
      if (!result) setFormKey((key) => key + 1);
      return result;
    },
    undefined,
  );
  const errors = state?.errors ?? {};

  return (
    <form
      key={formKey}
      action={formAction}
      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)_auto] sm:items-end"
    >
      <Field label="Who" htmlFor="team-member" error={errors.memberId ?? state?.message}>
        <FormSelect
          id="team-member"
          name="memberId"
          placeholder="Choose from the LAM roster"
          options={roster}
          required
        />
      </Field>
      <Field label="Part" htmlFor="team-part" error={errors.part}>
        <FormSelect
          id="team-part"
          name="part"
          placeholder="Choose a part"
          options={PART_OPTIONS}
          required
        />
      </Field>
      <Button type="submit" disabled={pending} className="sm:mb-px">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
        Schedule
      </Button>
    </form>
  );
}

/**
 * Who serves in a service, grouped by part in a fixed order — worship leader
 * first — so every line-up reads the same way. Only the LAM roster can be
 * scheduled; the server enforces it, and the picker offers no one else.
 */
export function TeamEditor({
  assignments,
  roster,
  canEdit,
  rosterHref = null,
  addAction,
  removeAction,
}: {
  assignments: TeamAssignment[];
  /** Members on the LAM roster. */
  roster: SelectOption[];
  canEdit: boolean;
  /** Where to manage the LAM roster, when the viewer may open it. */
  rosterHref?: string | null;
  addAction: (state: LineupFormState, formData: FormData) => Promise<LineupFormState>;
  removeAction: (id: string) => Promise<void>;
}) {
  // Not Map.groupBy: this runs in the browser, and older phones lack it.
  const byPart = new Map<LineupPart, TeamAssignment[]>();
  for (const assignment of assignments) {
    byPart.set(assignment.part, [...(byPart.get(assignment.part) ?? []), assignment]);
  }
  const parts = LINEUP_PARTS.filter((part) => byPart.has(part));

  return (
    <div className="space-y-4">
      {parts.length === 0 ? (
        <EmptyState
          variant="inline"
          icon={Users}
          title="No one scheduled yet"
          description={canEdit && roster.length > 0 ? "Schedule the team below." : undefined}
          className="py-6"
        />
      ) : (
        <dl className="divide-y rounded-md border">
          {parts.map((part) => (
            <div
              key={part}
              className="grid gap-1 px-3 py-2 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center"
            >
              <dt className="text-sm text-muted-foreground">{LINEUP_PART_LABELS[part]}</dt>
              <dd className="flex flex-wrap gap-1.5">
                {byPart.get(part)!.map((assignment) => (
                  <span
                    key={assignment.id}
                    className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 text-sm"
                  >
                    {assignment.memberName}
                    {canEdit ? (
                      <form action={removeAction.bind(null, assignment.id)} className="inline-flex">
                        <RemoveButton
                          label={`Remove ${assignment.memberName} from ${LINEUP_PART_LABELS[part]}`}
                        />
                      </form>
                    ) : null}
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {canEdit ? (
        roster.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No one is on the LAM roster yet, so no one can be scheduled.{" "}
            {rosterHref ? (
              <Link
                href={rosterHref}
                className="font-medium text-foreground underline underline-offset-4"
              >
                Add people to the roster
              </Link>
            ) : null}
          </p>
        ) : (
          <AddAssignmentForm roster={roster} action={addAction} />
        )
      ) : null}
    </div>
  );
}
