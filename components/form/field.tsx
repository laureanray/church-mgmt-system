import * as React from "react";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

/**
 * Label, control, and the one line of help or error text beneath it.
 *
 * The control is passed as `children` rather than rendered here, because forms
 * in this codebase submit `FormData` to a server action — the input has to stay
 * an uncontrolled DOM node with a `name`.
 *
 * When a single element is passed, Field wires the accessibility contract onto
 * it: `aria-describedby` pointing at whichever of hint/error is showing, and
 * `aria-invalid` while there is an error. That second one is not only for
 * screen readers — `components/ui/input.tsx` styles its error ring off
 * `aria-invalid`, so this is what turns a failed server-action round-trip into
 * a visibly red field. A caller that sets either prop itself keeps its value.
 */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  // Derived from `htmlFor`, not `useId`: Field carries no "use client", and a
  // hook would make it throw the moment a Server Component rendered it. A field
  // without `htmlFor` simply gets no association — which is also why every call
  // site should pass one.
  const messageId = !htmlFor
    ? undefined
    : error
      ? `${htmlFor}-error`
      : hint
        ? `${htmlFor}-hint`
        : undefined;

  const control =
    messageId && React.isValidElement<Record<string, unknown>>(children)
      ? React.cloneElement(children, {
          "aria-describedby":
            children.props["aria-describedby"] ?? messageId,
          "aria-invalid": children.props["aria-invalid"] ?? (error ? true : undefined),
        })
      : children;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {/* Decorative: the asterisk is a visual convention, and reading it out
            as "Full name star" is noise. The control's own `required` attribute
            is what carries the state to assistive tech. */}
        {required ? (
          <span aria-hidden className="text-destructive">
            {" *"}
          </span>
        ) : null}
      </Label>
      {control}
      {error ? (
        <p
          id={messageId}
          role="alert"
          className="text-xs font-medium text-destructive"
        >
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
