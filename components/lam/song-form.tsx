"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2, Save } from "lucide-react";

import type { SongFormState } from "@/app/(app)/lam/actions";
import { Field } from "@/components/form/field";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Song } from "@/db/schema";
import { cn } from "@/lib/utils";

type SongAction = (state: SongFormState, formData: FormData) => Promise<SongFormState>;

/** Add or edit a song in the LAM library. */
export function SongForm({
  action,
  song,
}: {
  action: SongAction;
  song?: Pick<Song, "title" | "artist" | "defaultKey" | "tempo" | "referenceUrl" | "notes">;
}) {
  const [state, formAction, pending] = useActionState<SongFormState, FormData>(
    action,
    undefined,
  );
  const errors = state?.errors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      {state?.message ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.message}
        </div>
      ) : null}

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" htmlFor="title" required error={errors.title} className="sm:col-span-2">
            <Input id="title" name="title" defaultValue={song?.title} required />
          </Field>
          <Field label="Artist" htmlFor="artist" error={errors.artist} className="sm:col-span-2">
            <Input id="artist" name="artist" defaultValue={song?.artist ?? ""} />
          </Field>
          <Field
            label="Default Key"
            htmlFor="defaultKey"
            error={errors.defaultKey}
            hint="Like G, Bb or F#m. A line-up can change it."
          >
            <Input
              id="defaultKey"
              name="defaultKey"
              defaultValue={song?.defaultKey ?? ""}
              maxLength={8}
              autoCapitalize="characters"
            />
          </Field>
          <Field label="Tempo (BPM)" htmlFor="tempo" error={errors.tempo}>
            <Input
              id="tempo"
              name="tempo"
              type="number"
              inputMode="numeric"
              min={20}
              max={300}
              defaultValue={song?.tempo ?? ""}
            />
          </Field>
          <Field
            label="Chords or Lyrics Link"
            htmlFor="referenceUrl"
            error={errors.referenceUrl}
            className="sm:col-span-2"
          >
            <Input
              id="referenceUrl"
              name="referenceUrl"
              type="url"
              defaultValue={song?.referenceUrl ?? ""}
              placeholder="https://"
            />
          </Field>
          <Field label="Notes" htmlFor="notes" error={errors.notes} className="sm:col-span-2">
            <Textarea id="notes" name="notes" defaultValue={song?.notes ?? ""} rows={3} />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Link href="/lam/songs" className={cn(buttonVariants({ variant: "outline" }))}>
          Cancel
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save song
        </Button>
      </div>
    </form>
  );
}
