import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin } from "lucide-react";

import {
  addLineupAssignment,
  addLineupSong,
  moveLineupSong,
  removeLineupAssignment,
  removeLineupSong,
} from "../../actions";
import { db } from "@/db";
import {
  lineupAssignments,
  lineupSongs,
  members,
  ministryMembers,
  services,
  songs,
} from "@/db/schema";
import { SetlistEditor } from "@/components/lam/setlist-editor";
import { TeamEditor } from "@/components/lam/team-editor";
import { BackLink } from "@/components/patterns/back-link";
import { InfoTile } from "@/components/patterns/info-tile";
import { PageHeader } from "@/components/patterns/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasPermission, requirePermission } from "@/lib/auth-helpers";
import { LAM_MINISTRY_ID, LINEUP_PARTS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { canViewMinistry } from "@/lib/ministry-access";
import { cn } from "@/lib/utils";

export default async function ServiceLineupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("lam.view");
  const { id } = await params;

  const canEdit = hasPermission(user, "lam.lineups_update");
  const [service, setlist, team, library, roster] = await Promise.all([
    db.query.services.findFirst({ where: eq(services.id, id) }),
    db
      .select({
        id: lineupSongs.id,
        title: songs.title,
        artist: songs.artist,
        songKey: lineupSongs.songKey,
        defaultKey: songs.defaultKey,
      })
      .from(lineupSongs)
      .innerJoin(songs, eq(songs.id, lineupSongs.songId))
      .where(eq(lineupSongs.serviceId, id))
      .orderBy(asc(lineupSongs.position), asc(lineupSongs.id)),
    db
      .select({
        id: lineupAssignments.id,
        memberName: members.fullName,
        part: lineupAssignments.part,
      })
      .from(lineupAssignments)
      .innerJoin(members, eq(members.id, lineupAssignments.memberId))
      .where(eq(lineupAssignments.serviceId, id))
      .orderBy(asc(members.fullName), asc(lineupAssignments.id)),
    canEdit
      ? db
          .select({
            id: songs.id,
            title: songs.title,
            artist: songs.artist,
            defaultKey: songs.defaultKey,
          })
          .from(songs)
          .orderBy(asc(songs.title), asc(songs.id))
      : Promise.resolve([]),
    canEdit
      ? db
          .select({ value: members.id, label: members.fullName })
          .from(ministryMembers)
          .innerJoin(members, eq(members.id, ministryMembers.memberId))
          .where(eq(ministryMembers.ministryId, LAM_MINISTRY_ID))
          .orderBy(asc(members.fullName), asc(members.id))
      : Promise.resolve([]),
  ]);
  if (!service) notFound();

  // Sorted by part in the fixed order the editor groups by.
  const partOrder = new Map(LINEUP_PARTS.map((part, index) => [part, index]));
  team.sort((a, b) => partOrder.get(a.part)! - partOrder.get(b.part)!);

  return (
    <div className="mx-auto max-w-4xl">
      <BackLink href="/lam" label="Back to line-ups" />
      <PageHeader title={service.name} description="Line-up">
        {hasPermission(user, "services.view") ? (
          <Link
            href={`/services/${service.id}`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <CalendarDays className="size-4" />
            Service details
          </Link>
        ) : null}
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <InfoTile label="When" value={formatDateTime(service.scheduledAt)} icon={CalendarDays} />
        <InfoTile label="Location" value={service.location ?? "—"} icon={MapPin} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Songs</CardTitle>
          </CardHeader>
          <CardContent>
            <SetlistEditor
              items={setlist}
              songs={library}
              canEdit={canEdit}
              canAddSongs={hasPermission(user, "lam.songs_create")}
              addAction={addLineupSong.bind(null, service.id)}
              moveAction={moveLineupSong.bind(null, service.id)}
              removeAction={removeLineupSong.bind(null, service.id)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Team</CardTitle>
          </CardHeader>
          <CardContent>
            <TeamEditor
              assignments={team}
              roster={roster}
              canEdit={canEdit}
              rosterHref={
                canViewMinistry(user, LAM_MINISTRY_ID) ? `/ministries/${LAM_MINISTRY_ID}` : null
              }
              addAction={addLineupAssignment.bind(null, service.id)}
              removeAction={removeLineupAssignment.bind(null, service.id)}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
