"use client";

import { useActionState } from "react";
import { Loader2, UserPlus } from "lucide-react";

import type { RosterFormState } from "@/app/(app)/ministries/actions";
import { Field } from "@/components/form/field";
import { FormSelect, type SelectOption } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";

/**
 * Adds a member to a ministry roster. New members join as "Member"; appointing
 * a head is a separate, more privileged action on the roster row.
 */
export function AddRosterMemberForm({
  action,
  options,
}: {
  action: (state: RosterFormState, formData: FormData) => Promise<RosterFormState>;
  /** Members not yet on the roster. */
  options: SelectOption[];
}) {
  const [state, formAction, pending] = useActionState<RosterFormState, FormData>(
    action,
    undefined,
  );

  if (options.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Every member is already on this roster.
      </p>
    );
  }

  return (
    // Keyed on the options, so a successful add (which revalidates the page
    // and removes that member from the list) also clears the selection.
    <form
      key={options.length}
      action={formAction}
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
    >
      <Field
        label="Add to roster"
        htmlFor="roster-member"
        error={state?.errors?.memberId ?? state?.message}
        className="min-w-0 flex-1"
      >
        <FormSelect
          id="roster-member"
          name="memberId"
          options={options}
          placeholder="Choose a member"
          required
        />
      </Field>
      <Button type="submit" disabled={pending} className="sm:mb-px">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
        Add
      </Button>
    </form>
  );
}
