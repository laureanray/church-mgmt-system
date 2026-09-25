import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import type { LineupFormState } from "@/app/(app)/lam/actions";
import { SetlistEditor, type LibrarySong, type SetlistItem } from "./setlist-editor";

const LIBRARY: LibrarySong[] = [
  { id: "s1", title: "Way Maker", artist: "Sinach", defaultKey: "E" },
  { id: "s2", title: "Goodness of God", artist: "Bethel Music", defaultKey: "A" },
  { id: "s3", title: "Dakilang Katapatan", artist: null, defaultKey: "G" },
  { id: "s4", title: "Build My Life", artist: "Housefires", defaultKey: "G" },
];

const PLANNED: SetlistItem[] = [
  { id: "l1", title: "Goodness of God", artist: "Bethel Music", songKey: null, defaultKey: "A" },
  { id: "l2", title: "Way Maker", artist: "Sinach", songKey: "D", defaultKey: "E" },
  { id: "l3", title: "Dakilang Katapatan", artist: null, songKey: null, defaultKey: "G" },
];

/**
 * Runs the editor against local state instead of server actions, so adding,
 * reordering and removing all work in Storybook.
 */
function SetlistEditorStory({
  initial,
  songs,
  canEdit,
  canAddSongs,
  addError,
}: {
  initial: SetlistItem[];
  songs: LibrarySong[];
  canEdit: boolean;
  canAddSongs?: boolean;
  /** Returned by the add action instead of adding, to show the error state. */
  addError?: LineupFormState;
}) {
  const [items, setItems] = useState(initial);

  async function add(
    _state: LineupFormState,
    formData: FormData,
  ): Promise<LineupFormState> {
    if (addError) return addError;
    const song = songs.find((s) => s.id === formData.get("songId"));
    if (!song) return { errors: { songId: "Choose a song" } };
    const key = String(formData.get("songKey") ?? "").trim();
    setItems((current) => [
      ...current,
      { ...song, id: crypto.randomUUID(), songKey: key || null },
    ]);
    return undefined;
  }

  async function move(id: string, direction: "up" | "down") {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === id);
      const target = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function remove(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  return (
    <div className="max-w-2xl">
      <SetlistEditor
        items={items}
        songs={songs}
        canEdit={canEdit}
        canAddSongs={canAddSongs}
        addAction={add}
        moveAction={move}
        removeAction={remove}
      />
    </div>
  );
}

const meta = {
  title: "LAM/SetlistEditor",
  component: SetlistEditorStory,
  parameters: { layout: "padded" },
  args: { initial: PLANNED, songs: LIBRARY, canEdit: true },
} satisfies Meta<typeof SetlistEditorStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A planned set. A brand key badge means the key was changed for this service. */
export const Planned: Story = {};

export const Empty: Story = { args: { initial: [] } };

/** Someone with `lam.view` but not `lam.lineups_update`. */
export const ReadOnly: Story = { args: { canEdit: false } };

export const EmptyLibrary: Story = {
  args: { initial: [], songs: [], canAddSongs: true },
};

export const AddError: Story = {
  args: { addError: { errors: { songId: "That song is no longer in the library." } } },
};
