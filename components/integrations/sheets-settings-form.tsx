"use client";

import { useActionState, useEffect, useTransition } from "react";
import { Loader2, PlugZap, Save } from "lucide-react";
import { toast } from "sonner";

import {
  saveSheetsSettings,
  testConnection,
  type SaveSettingsState,
} from "@/app/(app)/settings/actions";
import { Field } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SheetsSettingsForm({
  defaultUrl,
  defaultSecret,
  connected,
}: {
  defaultUrl: string;
  defaultSecret: string;
  connected: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    SaveSettingsState,
    FormData
  >(saveSheetsSettings, undefined);
  const [testing, startTest] = useTransition();

  useEffect(() => {
    if (state?.ok) toast.success(state.message ?? "Saved");
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <Field
        label="Web App URL"
        htmlFor="webhookUrl"
        hint="From Apps Script → Deploy → Web app (ends in /exec)"
      >
        <Input
          id="webhookUrl"
          name="webhookUrl"
          type="url"
          defaultValue={defaultUrl}
          placeholder="https://script.google.com/macros/s/…/exec"
        />
      </Field>

      <Field
        label="Shared secret"
        htmlFor="webhookSecret"
        hint="Must match the SECRET in your Apps Script"
      >
        <Input
          id="webhookSecret"
          name="webhookSecret"
          defaultValue={defaultSecret}
        />
      </Field>

      {state?.error ? (
        <p className="text-sm font-medium text-destructive">{state.error}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!connected || testing}
          onClick={() =>
            startTest(async () => {
              const res = await testConnection();
              if (res.ok) toast.success("Connected to Google Sheets 🎉");
              else toast.error(res.error ?? "Connection failed");
            })
          }
        >
          {testing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <PlugZap className="size-4" />
          )}
          Test connection
        </Button>
        {!connected ? (
          <span className="text-xs text-muted-foreground">
            Save your URL &amp; secret first, then test.
          </span>
        ) : null}
      </div>
    </form>
  );
}
