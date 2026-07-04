"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { toggleScheduleActive } from "@/app/(app)/services/schedules/actions";
import { Switch } from "@/components/ui/switch";

export function ScheduleActiveToggle({
  id,
  active,
  name,
}: {
  id: string;
  active: boolean;
  name: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Switch
      checked={active}
      disabled={pending}
      aria-label={`${active ? "Pause" : "Resume"} ${name}`}
      onCheckedChange={(next) => {
        startTransition(async () => {
          await toggleScheduleActive(id, next);
          toast.success(next ? `${name} resumed` : `${name} paused`);
        });
      }}
    />
  );
}
