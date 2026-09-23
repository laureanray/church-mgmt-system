"use client";

import { useFormStatus } from "react-dom";
import { Crown, Loader2, UserMinus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { MinistryPosition } from "@/lib/constants";

function PositionButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" size="sm" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Crown className="size-4" />}
      {label}
    </Button>
  );
}

function RemoveButton({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      aria-label={`Remove ${name} from the roster`}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <UserMinus className="size-4 text-destructive" />
      )}
    </Button>
  );
}

/**
 * A roster row's controls. Removing someone takes away the ministry's access
 * but leaves their member record untouched, and re-adding them is one step, so
 * it does not sit behind a confirmation dialog.
 */
export function RosterRowActions({
  name,
  position,
  canAppoint,
  canRemove,
  togglePositionAction,
  removeAction,
}: {
  name: string;
  position: MinistryPosition;
  /** Only `ministries.update` appoints heads. */
  canAppoint: boolean;
  canRemove: boolean;
  togglePositionAction: () => Promise<void>;
  removeAction: () => Promise<void>;
}) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      {canAppoint ? (
        <form action={togglePositionAction}>
          <PositionButton label={position === "head" ? "Make member" : "Make head"} />
        </form>
      ) : null}
      {canRemove ? (
        <form action={removeAction}>
          <RemoveButton name={name} />
        </form>
      ) : null}
    </div>
  );
}
