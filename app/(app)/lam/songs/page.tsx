import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, count, desc, eq, ilike, or } from "drizzle-orm";
import { ExternalLink, ListMusic, Pencil, Plus } from "lucide-react";

import { deleteSong } from "../actions";
import { db } from "@/db";
import { lineupSongs, songs } from "@/db/schema";
import { DataTable, type DataTableColumn } from "@/components/patterns/data-table";
import { ConfirmDeleteButton } from "@/components/patterns/confirm-delete-button";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { buttonVariants } from "@/components/ui/button";
import { hasPermission, requirePermission } from "@/lib/auth-helpers";
import {
  overRunPage,
  tableContext,
  tableHref,
  tableOffset,
  type RawSearchParams,
} from "@/lib/data-table";
import { cn } from "@/lib/utils";

type SongRow = {
  id: string;
  title: string;
  artist: string | null;
  defaultKey: string | null;
  tempo: number | null;
  referenceUrl: string | null;
  uses: number;
};

export default async function SongLibraryPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requirePermission("lam.view");

  const uses = db.$count(lineupSongs, eq(lineupSongs.songId, songs.id));
  const SORT_COLUMNS = {
    title: songs.title,
    artist: songs.artist,
    tempo: songs.tempo,
    uses,
  };

  const ctx = tableContext("/lam/songs", await searchParams, {
    sortKeys: Object.keys(SORT_COLUMNS),
    defaultSort: "title",
  });
  const { state } = ctx;
  const where = state.query
    ? or(ilike(songs.title, `%${state.query}%`), ilike(songs.artist, `%${state.query}%`))
    : undefined;
  const direction = state.direction === "asc" ? asc : desc;

  const [rows, [{ matching }]] = await Promise.all([
    db
      .select({
        id: songs.id,
        title: songs.title,
        artist: songs.artist,
        defaultKey: songs.defaultKey,
        tempo: songs.tempo,
        referenceUrl: songs.referenceUrl,
        uses,
      })
      .from(songs)
      .where(where)
      .orderBy(direction(SORT_COLUMNS[state.sort as keyof typeof SORT_COLUMNS]), asc(songs.id))
      .limit(state.perPage)
      .offset(tableOffset(state)),
    db.select({ matching: count() }).from(songs).where(where),
  ]);

  const clamped = overRunPage(state, matching);
  if (clamped !== null) redirect(tableHref(ctx, { page: clamped }));

  const canCreate = hasPermission(user, "lam.songs_create");
  const canUpdate = hasPermission(user, "lam.songs_update");
  const canDelete = hasPermission(user, "lam.songs_delete");

  const addSong = (
    <Link href="/lam/songs/new" className={cn(buttonVariants())}>
      <Plus className="size-4" />
      Add song
    </Link>
  );

  const columns: DataTableColumn<SongRow>[] = [
    {
      id: "title",
      header: "Title",
      sortKey: "title",
      hideable: false,
      cell: (song) => (
        <div>
          <div className="flex items-center gap-1.5 font-medium">
            {song.title}
            {song.referenceUrl ? (
              <a
                href={song.referenceUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open chords or lyrics for ${song.title}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-3.5" />
              </a>
            ) : null}
          </div>
          {/* Stands in for the Artist column, which is hidden on small screens. */}
          {song.artist ? (
            <div className="text-xs text-muted-foreground sm:hidden">{song.artist}</div>
          ) : null}
        </div>
      ),
    },
    {
      id: "artist",
      header: "Artist",
      sortKey: "artist",
      hideBelow: "sm",
      cellClassName: "text-muted-foreground",
      cell: (song) => song.artist ?? "—",
    },
    {
      id: "key",
      header: "Key",
      cell: (song) => song.defaultKey ?? "—",
    },
    {
      id: "tempo",
      header: "BPM",
      label: "Tempo",
      sortKey: "tempo",
      numeric: true,
      hideBelow: "md",
      cell: (song) => song.tempo ?? "—",
    },
    {
      id: "uses",
      header: "Line-ups",
      sortKey: "uses",
      sortDirection: "desc",
      numeric: true,
      hideBelow: "md",
      cell: (song) => song.uses,
    },
    {
      id: "actions",
      header: "Actions",
      srOnlyHeader: true,
      hideable: false,
      align: "end",
      width: "w-20",
      cell: (song) => (
        <div className="flex items-center justify-end gap-0.5">
          {canUpdate ? (
            <Link
              href={`/lam/songs/${song.id}/edit`}
              className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
              aria-label={`Edit ${song.title}`}
            >
              <Pencil className="size-4" />
            </Link>
          ) : null}
          {/* A song a line-up uses stays, so past line-ups keep their history. */}
          {canDelete && song.uses === 0 ? (
            <ConfirmDeleteButton
              name={song.title}
              title={`Delete “${song.title}”?`}
              description="This removes the song from the library. No line-up uses it."
              confirmLabel="Delete song"
              action={deleteSong.bind(null, song.id)}
            />
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader title="Song Library" description="Every song LAM can put in a line-up.">
        {canCreate ? addSong : null}
      </PageHeader>
      <DataTable
        ctx={ctx}
        caption="Song library"
        columns={columns}
        rows={rows}
        rowKey={(song) => song.id}
        total={matching}
        search={{ placeholder: "Search title or artist…", label: "Search songs by title or artist" }}
        empty={{
          icon: ListMusic,
          title: "No songs yet",
          description: "Add the songs your team plays, then build line-ups from them.",
          action: canCreate ? addSong : null,
        }}
        emptyFiltered={{ icon: ListMusic, title: "No songs match your search" }}
      />
    </PageContainer>
  );
}
