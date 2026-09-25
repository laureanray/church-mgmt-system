"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowDown, ArrowUp, ListMusic, Loader2, Plus, X } from "lucide-react";

import type { LineupFormState } from "@/app/(app)/lam/actions";
import { Field } from "@/components/form/field";
import { FormSelect } from "@/components/form/form-select";
import { EmptyState } from "@/components/patterns/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type SetlistItem = {
  id: string;
  title: string;
  artist: string | null;
  /** The key for this service, when it differs from the song's default. */
  songKey: string | null;
  defaultKey: string | null;
};

export type LibrarySong = {
  id: string;
  title: string;
  artist: string | null;
  defaultKey: string | null;
};

function IconSubmit({
  label,
  children,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      disabled={disabled || pending}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : children}
    </Button>
  );
}

function AddSongForm({
  songs,
  action,
}: {
  songs: LibrarySong[];
  action: (state: LineupFormState, formData: FormData) => Promise<LineupFormState>;
}) {
  const [songId, setSongId] = useState("");
  const [formKey, setFormKey] = useState(0);
  const [state, formAction, pending] = useActionState<LineupFormState, FormData>(
    async (previous, formData) => {
      const result = await action(previous, formData);
      // Success returns nothing: clear the form for the next song. On an error
      // the choices stay, so the reader can correct rather than start over.
      if (!result) {
        setSongId("");
        setFormKey((key) => key + 1);
      }
      return result;
    },
    undefined,
  );
  const defaultKey = songs.find((song) => song.id === songId)?.defaultKey;
  const errors = state?.errors ?? {};

  return (
    <form
      key={formKey}
      action={formAction}
      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-end"
    >
      <Field label="Song" htmlFor="setlist-song" error={errors.songId ?? state?.message}>
        <FormSelect
          id="setlist-song"
          name="songId"
          placeholder="Choose a song"
          options={songs.map((song) => ({
            value: song.id,
            label: song.artist ? `${song.title} — ${song.artist}` : song.title,
          }))}
          onValueChange={setSongId}
          required
        />
      </Field>
      <Field label="Key" htmlFor="setlist-key" error={errors.songKey}>
        <Input
          id="setlist-key"
          name="songKey"
          maxLength={8}
          placeholder={defaultKey ?? "Default"}
        />
      </Field>
      <Button type="submit" disabled={pending} className="sm:mb-px">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        Add song
      </Button>
    </form>
  );
}

/**
 * A service's songs, in the order they are sung. Keys shown are the service's
 * own when set, else the song's default, so the band reads one key per song.
 */
export function SetlistEditor({
  items,
  songs,
  canEdit,
  canAddSongs = false,
  addAction,
  moveAction,
  removeAction,
}: {
  items: SetlistItem[];
  songs: LibrarySong[];
  canEdit: boolean;
  /** Offer a link to the library when it is empty. */
  canAddSongs?: boolean;
  addAction: (state: LineupFormState, formData: FormData) => Promise<LineupFormState>;
  moveAction: (id: string, direction: "up" | "down") => Promise<void>;
  removeAction: (id: string) => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <EmptyState
          variant="inline"
          icon={ListMusic}
          title="No songs yet"
          description={canEdit ? "Add the first song below." : undefined}
          className="py-6"
        />
      ) : (
        <ol className="divide-y rounded-md border">
          {items.map((item, index) => {
            const key = item.songKey ?? item.defaultKey;
            return (
              <li key={item.id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-5 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  {item.artist ? (
                    <p className="truncate text-xs text-muted-foreground">{item.artist}</p>
                  ) : null}
                </div>
                {key ? (
                  <Badge variant={item.songKey ? "brand" : "outline"}>Key {key}</Badge>
                ) : null}
                {canEdit ? (
                  <div className="flex shrink-0 items-center">
                    <form action={moveAction.bind(null, item.id, "up")}>
                      <IconSubmit label={`Move ${item.title} up`} disabled={index === 0}>
                        <ArrowUp className="size-4" />
                      </IconSubmit>
                    </form>
                    <form action={moveAction.bind(null, item.id, "down")}>
                      <IconSubmit
                        label={`Move ${item.title} down`}
                        disabled={index === items.length - 1}
                      >
                        <ArrowDown className="size-4" />
                      </IconSubmit>
                    </form>
                    <form action={removeAction.bind(null, item.id)}>
                      <IconSubmit label={`Remove ${item.title}`}>
                        <X className="size-4 text-destructive" />
                      </IconSubmit>
                    </form>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {canEdit ? (
        songs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            The song library is empty.{" "}
            {canAddSongs ? (
              <Link
                href="/lam/songs/new"
                className="font-medium text-foreground underline underline-offset-4"
              >
                Add a song
              </Link>
            ) : (
              "Ask someone who manages it to add songs."
            )}
          </p>
        ) : (
          <AddSongForm songs={songs} action={addAction} />
        )
      ) : null}
    </div>
  );
}
