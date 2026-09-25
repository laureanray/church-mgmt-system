import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { updateSong } from "../../../actions";
import { db } from "@/db";
import { songs } from "@/db/schema";
import { SongForm } from "@/components/lam/song-form";
import { BackLink } from "@/components/patterns/back-link";
import { PageHeader } from "@/components/patterns/page-header";
import { requirePermission } from "@/lib/auth-helpers";

export default async function EditSongPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("lam.songs_update");
  const { id } = await params;
  const song = await db.query.songs.findFirst({ where: eq(songs.id, id) });
  if (!song) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href="/lam/songs" label="Back to song library" />
      <PageHeader title="Edit Song" description={song.title} />
      <SongForm action={updateSong.bind(null, song.id)} song={song} />
    </div>
  );
}
