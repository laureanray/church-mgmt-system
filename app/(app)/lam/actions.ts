"use server";

import { and, asc, desc, eq, gt, lt, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import {
  lineupAssignments,
  lineupSongs,
  ministryMembers,
  services,
  songs,
} from "@/db/schema";
import { requirePermission } from "@/lib/auth-helpers";
import { LAM_MINISTRY_ID } from "@/lib/constants";
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
  await requirePermission("lam.songs_create");
  const parsed = songSchema.safeParse(songValues(formData));
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  await db.insert(songs).values(parsed.data);
  revalidatePath("/lam/songs");
  redirect("/lam/songs");
}

export async function updateSong(
  id: string,
  _previous: SongFormState,
  formData: FormData,
): Promise<SongFormState> {
  await requirePermission("lam.songs_update");
  const parsed = songSchema.safeParse(songValues(formData));
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  await db
    .update(songs)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(songs.id, id));
  revalidatePath("/lam/songs");
  // Line-ups show the title and default key.
  revalidatePath("/lam", "layout");
  redirect("/lam/songs");
}

export async function deleteSong(id: string) {
  await requirePermission("lam.songs_delete");
  // No check-then-delete: a song could join a line-up between the two. The
  // restrictive foreign key is the atomic check, and a song in use is a no-op.
  try {
    await db.delete(songs).where(eq(songs.id, id));
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
  await requirePermission("lam.lineups_update");
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
    columns: { id: true },
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
    await tx.insert(lineupSongs).values({
      serviceId,
      songId: song.id,
      songKey: parsed.data.songKey,
      position: (last ?? 0) + 1,
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
  await requirePermission("lam.lineups_update");
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
  });
  revalidateLineup(serviceId);
}

export async function removeLineupSong(serviceId: string, id: string) {
  await requirePermission("lam.lineups_update");
  await db
    .delete(lineupSongs)
    .where(and(eq(lineupSongs.id, id), eq(lineupSongs.serviceId, serviceId)));
  revalidateLineup(serviceId);
}

export async function addLineupAssignment(
  serviceId: string,
  _previous: LineupFormState,
  formData: FormData,
): Promise<LineupFormState> {
  await requirePermission("lam.lineups_update");
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

    const added = await tx
      .insert(lineupAssignments)
      .values({ serviceId, ...parsed.data })
      .onConflictDoNothing()
      .returning({ id: lineupAssignments.id });
    return added.length === 0 ? ("duplicate" as const) : ("added" as const);
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
  await requirePermission("lam.lineups_update");
  await db
    .delete(lineupAssignments)
    .where(
      and(eq(lineupAssignments.id, id), eq(lineupAssignments.serviceId, serviceId)),
    );
  revalidateLineup(serviceId);
}
