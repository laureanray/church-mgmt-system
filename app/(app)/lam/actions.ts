"use server";

import { and, asc, desc, eq, gt, lt, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import {
  lineupAssignments,
  lineupSongs,
  members,
  ministryMembers,
  services,
  songs,
} from "@/db/schema";
import { recordAudit, type DbExecutor } from "@/lib/audit";
import { describeFields } from "@/lib/audit-diff";
import { requirePermission } from "@/lib/auth-helpers";
import { LAM_MINISTRY_ID, LINEUP_PART_LABELS } from "@/lib/constants";
import { isForeignKeyViolation } from "@/lib/db-errors";
import {
  fieldErrors,
  lineupAssignmentSchema,
  lineupSongSchema,
  songSchema,
} from "@/lib/validators";

export type SongFormState =
  | { errors?: Record<string, string>; message?: string }
  | undefined;

export type LineupFormState =
  | { errors?: Record<string, string>; message?: string }
  | undefined;

// --- Song library ----------------------------------------------------------

function songValues(formData: FormData) {
  return {
    title: formData.get("title"),
    artist: formData.get("artist"),
    defaultKey: formData.get("defaultKey"),
    tempo: formData.get("tempo"),
    referenceUrl: formData.get("referenceUrl"),
    notes: formData.get("notes"),
  };
}

export async function createSong(
  _previous: SongFormState,
  formData: FormData,
): Promise<SongFormState> {
  const actor = await requirePermission("lam.songs_create");
  const parsed = songSchema.safeParse(songValues(formData));
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  await db.transaction(async (tx) => {
    const [song] = await tx.insert(songs).values(parsed.data).returning();
    await recordAudit(tx, {
      actorId: actor.id,
      action: "song.create",
      entity: "song",
      entityId: song.id,
      after: song,
      summary: `Added ${song.title} to the song library`,
    });
  });
  revalidatePath("/lam/songs");
  redirect("/lam/songs");
}

export async function updateSong(
  id: string,
  _previous: SongFormState,
  formData: FormData,
): Promise<SongFormState> {
  const actor = await requirePermission("lam.songs_update");
  const parsed = songSchema.safeParse(songValues(formData));
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(songs).where(eq(songs.id, id)).for("update");
    const [updated] = await tx
      .update(songs)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(songs.id, id))
      .returning();
    if (!before || !updated) return;
    await recordAudit(tx, {
      actorId: actor.id,
      action: "song.update",
      entity: "song",
      entityId: id,
      before,
      after: updated,
      summary: (fields) => `Edited song ${updated.title}: ${describeFields(fields)}`,
    });
  });
  revalidatePath("/lam/songs");
  // Line-ups show the title and default key.
  revalidatePath("/lam", "layout");
  redirect("/lam/songs");
}

export async function deleteSong(id: string) {
  const actor = await requirePermission("lam.songs_delete");
  // No check-then-delete: a song could join a line-up between the two. The
  // restrictive foreign key is the atomic check, and a song in use is a no-op
  // — its audit entry rolls back with the delete.
  try {
    await db.transaction(async (tx) => {
      const [deleted] = await tx.delete(songs).where(eq(songs.id, id)).returning();
      if (!deleted) return;
      await recordAudit(tx, {
        actorId: actor.id,
        action: "song.delete",
        entity: "song",
        entityId: id,
        before: deleted,
        summary: `Deleted ${deleted.title} from the song library`,
      });
    });
  } catch (err) {
    if (isForeignKeyViolation(err)) return;
    throw err;
  }
  revalidatePath("/lam/songs");
}

// --- Line-ups --------------------------------------------------------------

function revalidateLineup(serviceId: string) {
  revalidatePath("/lam");
  revalidatePath(`/lam/services/${serviceId}`);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Serializes set-list changes for one service for the rest of the transaction. */
async function lockService(tx: Tx, serviceId: string) {
  await tx
    .select({ id: services.id })
    .from(services)
    .where(eq(services.id, serviceId))
    .for("update");
}

/**
 * A line-up is part of its service, so its changes are logged against the
 * service. `describe` receives the service's name for the summary.
 */
async function recordLineupChange(
  executor: DbExecutor,
  entry: {
    actorId: string;
    serviceId: string;
    action: "lineup.songs_change" | "lineup.team_change";
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    describe: (service: string) => string;
  },
) {
  const [service] = await executor
    .select({ name: services.name })
    .from(services)
    .where(eq(services.id, entry.serviceId));
  if (!service) return;
  await recordAudit(executor, {
    actorId: entry.actorId,
    action: entry.action,
    entity: "service",
    entityId: entry.serviceId,
    before: entry.before,
    after: entry.after,
    summary: entry.describe(service.name),
  });
}

async function serviceExists(serviceId: string) {
  const service = await db.query.services.findFirst({
    where: eq(services.id, serviceId),
    columns: { id: true },
  });
  return Boolean(service);
}

export async function addLineupSong(
  serviceId: string,
  _previous: LineupFormState,
  formData: FormData,
): Promise<LineupFormState> {
  const actor = await requirePermission("lam.lineups_update");
  const parsed = lineupSongSchema.safeParse({
    songId: formData.get("songId"),
    songKey: formData.get("songKey"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  if (!(await serviceExists(serviceId))) {
    return { message: "That service no longer exists." };
  }

  const song = await db.query.songs.findFirst({
    where: eq(songs.id, parsed.data.songId),
    columns: { id: true, title: true },
  });
  if (!song) return { errors: { songId: "That song is no longer in the library." } };

  await db.transaction(async (tx) => {
    // Locks the service row, so two planners adding at once take turns rather
    // than both reading the same last position.
    await lockService(tx, serviceId);
    const [{ last }] = await tx
      .select({ last: max(lineupSongs.position) })
      .from(lineupSongs)
      .where(eq(lineupSongs.serviceId, serviceId));
    const [added] = await tx
      .insert(lineupSongs)
      .values({
        serviceId,
        songId: song.id,
        songKey: parsed.data.songKey,
        position: (last ?? 0) + 1,
      })
      .returning();
    await recordLineupChange(tx, {
      actorId: actor.id,
      serviceId,
      action: "lineup.songs_change",
      after: { song: song.title, songKey: added.songKey, position: added.position },
      describe: (service) => `Added ${song.title} to the set list for ${service}`,
    });
  });

  revalidateLineup(serviceId);
  return undefined;
}

/** Swaps a song with its neighbour. Positions may have gaps; order is all. */
export async function moveLineupSong(
  serviceId: string,
  id: string,
  direction: "up" | "down",
) {
  const actor = await requirePermission("lam.lineups_update");
  // Arguments bound on the client arrive as whatever the client sent.
  if (direction !== "up" && direction !== "down") return;
  await db.transaction(async (tx) => {
    await lockService(tx, serviceId);
    const item = await tx.query.lineupSongs.findFirst({
      where: and(eq(lineupSongs.id, id), eq(lineupSongs.serviceId, serviceId)),
    });
    if (!item) return;

    const [neighbour] = await tx
      .select({ id: lineupSongs.id, position: lineupSongs.position })
      .from(lineupSongs)
      .where(
        and(
          eq(lineupSongs.serviceId, serviceId),
          direction === "up"
            ? lt(lineupSongs.position, item.position)
            : gt(lineupSongs.position, item.position),
        ),
      )
      .orderBy(
        direction === "up" ? desc(lineupSongs.position) : asc(lineupSongs.position),
      )
      .limit(1);
    if (!neighbour) return;

    await tx
      .update(lineupSongs)
      .set({ position: neighbour.position })
      .where(eq(lineupSongs.id, item.id));
    await tx
      .update(lineupSongs)
      .set({ position: item.position })
      .where(eq(lineupSongs.id, neighbour.id));

    const song = await tx.query.songs.findFirst({
      where: eq(songs.id, item.songId),
      columns: { title: true },
    });
    await recordLineupChange(tx, {
      actorId: actor.id,
      serviceId,
      action: "lineup.songs_change",
      before: { song: song?.title, position: item.position },
      after: { song: song?.title, position: neighbour.position },
      describe: (service) => `Moved ${song?.title} ${direction} in the set list for ${service}`,
    });
  });
  revalidateLineup(serviceId);
}

export async function removeLineupSong(serviceId: string, id: string) {
  const actor = await requirePermission("lam.lineups_update");
  await db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(lineupSongs)
      .where(and(eq(lineupSongs.id, id), eq(lineupSongs.serviceId, serviceId)))
      .returning();
    if (!removed) return;
    const song = await tx.query.songs.findFirst({
      where: eq(songs.id, removed.songId),
      columns: { title: true },
    });
    await recordLineupChange(tx, {
      actorId: actor.id,
      serviceId,
      action: "lineup.songs_change",
      before: { song: song?.title, songKey: removed.songKey, position: removed.position },
      describe: (service) => `Removed ${song?.title} from the set list for ${service}`,
    });
  });
  revalidateLineup(serviceId);
}

export async function addLineupAssignment(
  serviceId: string,
  _previous: LineupFormState,
  formData: FormData,
): Promise<LineupFormState> {
  const actor = await requirePermission("lam.lineups_update");
  const parsed = lineupAssignmentSchema.safeParse({
    memberId: formData.get("memberId"),
    part: formData.get("part"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  if (!(await serviceExists(serviceId))) {
    return { message: "That service no longer exists." };
  }

  // The LAM roster is who may serve. This is the link between the ministry and
  // its module: rostering someone in LAM is what makes them schedulable. The
  // roster row stays share-locked until the insert commits, so a head removing
  // them meanwhile either waits for it or has already won and is seen here.
  const outcome = await db.transaction(async (tx) => {
    const [rostered] = await tx
      .select({ memberId: ministryMembers.memberId })
      .from(ministryMembers)
      .where(
        and(
          eq(ministryMembers.ministryId, LAM_MINISTRY_ID),
          eq(ministryMembers.memberId, parsed.data.memberId),
        ),
      )
      .for("share");
    if (!rostered) return "not-rostered" as const;

    const [added] = await tx
      .insert(lineupAssignments)
      .values({ serviceId, ...parsed.data })
      .onConflictDoNothing()
      .returning();
    if (!added) return "duplicate" as const;

    await recordTeamChange(tx, actor.id, { serviceId, added });
    return "added" as const;
  });
  if (outcome === "not-rostered") {
    return { errors: { memberId: "Only members on the LAM roster can be scheduled." } };
  }
  if (outcome === "duplicate") {
    return { errors: { part: "They are already down for that part." } };
  }

  revalidateLineup(serviceId);
  return undefined;
}

export async function removeLineupAssignment(serviceId: string, id: string) {
  const actor = await requirePermission("lam.lineups_update");
  await db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(lineupAssignments)
      .where(
        and(eq(lineupAssignments.id, id), eq(lineupAssignments.serviceId, serviceId)),
      )
      .returning();
    if (removed) await recordTeamChange(tx, actor.id, { serviceId, removed });
  });
  revalidateLineup(serviceId);
}

type Assignment = typeof lineupAssignments.$inferSelect;

async function recordTeamChange(
  executor: DbExecutor,
  actorId: string,
  change: { serviceId: string; added?: Assignment; removed?: Assignment },
) {
  const assignment = change.added ?? change.removed;
  if (!assignment) return;
  const member = await executor.query.members.findFirst({
    where: eq(members.id, assignment.memberId),
    columns: { fullName: true },
  });
  const who = member?.fullName ?? "a member";
  const part = LINEUP_PART_LABELS[assignment.part as keyof typeof LINEUP_PART_LABELS] ?? assignment.part;
  const row = { member: who, part: assignment.part };
  await recordLineupChange(executor, {
    actorId,
    serviceId: change.serviceId,
    action: "lineup.team_change",
    before: change.removed ? row : undefined,
    after: change.added ? row : undefined,
    describe: (service) =>
      change.added
        ? `Put ${who} on ${part} for ${service}`
        : `Took ${who} off ${part} for ${service}`,
  });
}
