"use client";

import { useTransition } from "react";
import { Loader2, Sheet } from "lucide-react";
import { toast } from "sonner";

import {
  syncAllAttendance,
  syncServiceAttendance,
} from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";

function report(res: { ok: boolean; synced?: number; error?: string }) {
  if (res.ok) {
    const n = res.synced;
    toast.success(
      n === undefined
        ? "Synced to Google Sheets"
        : n === 0
          ? "Already up to date — nothing new to sync"
          : `Synced ${n} new row${n === 1 ? "" : "s"} to Google Sheets`,
    );
  } else {
    toast.error(res.error ?? "Sync failed");
  }
}

export function SyncAllButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => start(async () => report(await syncAllAttendance()))}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Sheet className="size-4" />
      )}
      Sync all attendance
    </Button>
  );
}

export function SyncServiceButton({ serviceId }: { serviceId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => report(await syncServiceAttendance(serviceId)))
      }
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Sheet className="size-4" />
      )}
      Sync to Sheets
    </Button>
  );
}
