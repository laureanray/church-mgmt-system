"use client";

import { useId } from "react";

import { Checkbox } from "@/components/ui/checkbox";

/**
 * The consent notice a member agrees to before their face is enrolled, with
 * the box staff tick on their behalf. Used wherever a face can be added: the
 * member page, the new-member form, and adding a visitor at the door.
 *
 * Give it a `name` inside a form, and the tick is submitted with it (as "on").
 */
export function FaceConsentNotice({
  notice,
  subject,
  checked,
  onCheckedChange,
  name,
  disabled = false,
  error,
}: {
  notice: string;
  /** Who is agreeing — "Ana Santos", or "They" before a name is known. */
  subject: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  name?: string;
  disabled?: boolean;
  /** Why the server refused: consent was not recorded. */
  error?: string;
}) {
  const checkboxId = useId();
  const errorId = useId();

  return (
    <div className="space-y-2 rounded-md border bg-muted/40 p-3">
      <p className="text-xs font-medium">Consent notice</p>
      <div
        className="max-h-40 overflow-y-auto text-xs whitespace-pre-line text-muted-foreground"
        tabIndex={0}
        aria-label="Consent notice"
      >
        {notice}
      </div>
      <label htmlFor={checkboxId} className="flex items-start gap-2 border-t pt-2 text-sm">
        <Checkbox
          id={checkboxId}
          name={name}
          value="yes"
          checked={checked}
          onCheckedChange={(next) => onCheckedChange(next === true)}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="mt-0.5"
        />
        <span>
          {subject} {subject === "They" ? "have" : "has"} read this notice, or had
          it read to them, and {subject === "They" ? "agree" : "agrees"}.
        </span>
      </label>
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
