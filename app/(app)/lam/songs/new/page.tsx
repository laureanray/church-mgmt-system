import { createSong } from "../../actions";
import { SongForm } from "@/components/lam/song-form";
import { BackLink } from "@/components/patterns/back-link";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { requirePermission } from "@/lib/auth-helpers";

export default async function NewSongPage() {
  await requirePermission("lam.songs_create");
  return (
    <PageContainer width="form">
      <BackLink href="/lam/songs" label="Back to song library" />
      <PageHeader title="Add Song" />
      <SongForm action={createSong} />
    </PageContainer>
  );
}
