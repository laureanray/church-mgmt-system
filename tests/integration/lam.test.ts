import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { asc, eq } from "drizzle-orm";

import { connectTestDatabase, resetTestDatabase } from "../support/database";
import {
  auditLog,
  lineupAssignments,
  lineupSongs,
  members,
  ministryMembers,
  services,
  songs,
  users,
} from "../../db/schema";

const database = connectTestDatabase();
const requirePermission = mock();
class Redirect extends Error {}
await mock.module("@/db", () => ({ db: database.db }));
// Only the session is replaced; bun keeps a module mock for the rest of the
// run, so the real exports (hasPermission and friends) have to stay.
const realAuthHelpers = await import("@/lib/auth-helpers");
await mock.module("@/lib/auth-helpers", () => ({
  ...realAuthHelpers,
  requirePermission,
  requireUser: mock(),
}));
await mock.module("next/cache", () => ({ revalidatePath: mock() }));
await mock.module("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
}));
const {
  addLineupAssignment,
  addLineupSong,
  createSong,
  deleteSong,
  moveLineupSong,
  removeLineupAssignment,
  removeLineupSong,
  updateSong,
} = await import("../../app/(app)/lam/actions");

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

async function setlist() {
  const rows = await database.db
    .select({ songId: lineupSongs.songId, key: lineupSongs.songKey })
    .from(lineupSongs)
    .where(eq(lineupSongs.serviceId, "sunday"))
    .orderBy(asc(lineupSongs.position));
  return rows;
}

beforeEach(async () => {
  await resetTestDatabase(database.client);
  requirePermission.mockReset();
  requirePermission.mockResolvedValue({ id: "staff", permissions: ["lam.lineups_update"] });
  // The acting staff member: audit entries reference a real user.
  await database.db
    .insert(users)
    .values({ id: "staff", email: "staff@example.test", name: "Staff", roleId: "usher" });
  await database.db.insert(members).values([
    { id: "joy", fullName: "Joy Villanueva", qrToken: "joy" },
    { id: "mark", fullName: "Mark Bautista", qrToken: "mark" },
  ]);
  await database.db.insert(ministryMembers).values({ ministryId: "lam", memberId: "joy" });
  await database.db.insert(services).values({ id: "sunday", name: "Sunday", scheduledAt: new Date() });
  await database.db.insert(songs).values([
    { id: "way-maker", title: "Way Maker", defaultKey: "E" },
    { id: "goodness", title: "Goodness of God", defaultKey: "A" },
    { id: "unused", title: "Build My Life" },
  ]);
});
afterAll(() => database.client.end());

describe("team", () => {
  it("schedules someone on the LAM roster", async () => {
    expect(
      await addLineupAssignment("sunday", undefined, form({ memberId: "joy", part: "vocals" })),
    ).toBeUndefined();
    expect(await database.db.select().from(lineupAssignments)).toHaveLength(1);
  });

  it("refuses anyone not on the LAM roster", async () => {
    expect(
      await addLineupAssignment("sunday", undefined, form({ memberId: "mark", part: "keys" })),
    ).toEqual({ errors: { memberId: "Only members on the LAM roster can be scheduled." } });
    expect(await database.db.select().from(lineupAssignments)).toHaveLength(0);
  });

  it("refuses the same person twice in one part, but allows a second part", async () => {
    await addLineupAssignment("sunday", undefined, form({ memberId: "joy", part: "vocals" }));
    expect(
      await addLineupAssignment("sunday", undefined, form({ memberId: "joy", part: "vocals" })),
    ).toEqual({ errors: { part: "They are already down for that part." } });
    expect(
      await addLineupAssignment(
        "sunday",
        undefined,
        form({ memberId: "joy", part: "worship_leader" }),
      ),
    ).toBeUndefined();
    expect(await database.db.select().from(lineupAssignments)).toHaveLength(2);
  });

  it("refuses someone removed from the roster mid-request", async () => {
    // A head removes Joy from LAM in a transaction that has not committed yet.
    // The assignment's roster check has to wait for it rather than read the
    // row that is about to go.
    const rival = await database.client.reserve();
    try {
      await rival`BEGIN`;
      await rival`DELETE FROM ministry_members WHERE ministry_id = 'lam' AND member_id = 'joy'`;

      const pending = addLineupAssignment(
        "sunday",
        undefined,
        form({ memberId: "joy", part: "vocals" }),
      );
      // Give the roster check time to block on the rival's row lock.
      await new Promise((resolve) => setTimeout(resolve, 300));
      await rival`COMMIT`;

      expect(await pending).toEqual({
        errors: { memberId: "Only members on the LAM roster can be scheduled." },
      });
    } finally {
      // A no-op after COMMIT; after a failure it keeps the pooled connection
      // from carrying an open transaction into the next test.
      await rival`ROLLBACK`.catch(() => {});
      rival.release();
    }
    expect(await database.db.select().from(lineupAssignments)).toHaveLength(0);
  });

  it("requires the line-up permission", async () => {
    requirePermission.mockRejectedValueOnce(new Redirect("/no-access"));
    await expect(
      addLineupAssignment("sunday", undefined, form({ memberId: "joy", part: "vocals" })),
    ).rejects.toThrow(Redirect);
    expect(requirePermission).toHaveBeenCalledWith("lam.lineups_update");
  });
});

describe("songs", () => {
  it("appends songs in order and moves them", async () => {
    await addLineupSong("sunday", undefined, form({ songId: "way-maker", songKey: "D" }));
    await addLineupSong("sunday", undefined, form({ songId: "goodness", songKey: "" }));
    expect(await setlist()).toEqual([
      { songId: "way-maker", key: "D" },
      { songId: "goodness", key: null },
    ]);

    const [, second] = await database.db
      .select({ id: lineupSongs.id })
      .from(lineupSongs)
      .orderBy(asc(lineupSongs.position));
    await moveLineupSong("sunday", second.id, "up");
    expect((await setlist()).map((row) => row.songId)).toEqual(["goodness", "way-maker"]);

    // Moving past either end is a no-op.
    await moveLineupSong("sunday", second.id, "up");
    expect((await setlist()).map((row) => row.songId)).toEqual(["goodness", "way-maker"]);

    await removeLineupSong("sunday", second.id);
    expect((await setlist()).map((row) => row.songId)).toEqual(["way-maker"]);
  });

  it("gives concurrent additions distinct positions", async () => {
    // Without the service lock both transactions read the same last position.
    await Promise.all(
      ["way-maker", "goodness", "unused", "way-maker", "goodness"].map((songId) =>
        addLineupSong("sunday", undefined, form({ songId, songKey: "" })),
      ),
    );
    const positions = (
      await database.db
        .select({ position: lineupSongs.position })
        .from(lineupSongs)
        .where(eq(lineupSongs.serviceId, "sunday"))
    ).map((row) => row.position);
    expect(new Set(positions).size).toBe(5);
  });

  it("ignores a move for an item on another service", async () => {
    await database.db.insert(services).values({ id: "midweek", name: "Midweek", scheduledAt: new Date() });
    await addLineupSong("sunday", undefined, form({ songId: "way-maker", songKey: "" }));
    await addLineupSong("sunday", undefined, form({ songId: "goodness", songKey: "" }));
    const [first] = await database.db.select({ id: lineupSongs.id }).from(lineupSongs).orderBy(asc(lineupSongs.position));

    await moveLineupSong("midweek", first.id, "down");
    await removeLineupSong("midweek", first.id);
    expect((await setlist()).map((row) => row.songId)).toEqual(["way-maker", "goodness"]);
  });

  it("keeps a song a line-up uses, and deletes one nobody uses", async () => {
    requirePermission.mockResolvedValue({ id: "staff", permissions: ["lam.songs_delete"] });
    await database.db
      .insert(lineupSongs)
      .values({ serviceId: "sunday", songId: "way-maker", position: 1 });

    await deleteSong("way-maker");
    await deleteSong("unused");

    const remaining = await database.db.select({ id: songs.id }).from(songs).orderBy(asc(songs.id));
    expect(remaining.map((song) => song.id)).toEqual(["goodness", "way-maker"]);
  });
});

describe("audit", () => {
  async function entries() {
    return database.db
      .select({
        action: auditLog.action,
        entity: auditLog.entity,
        entityId: auditLog.entityId,
        before: auditLog.before,
        after: auditLog.after,
        summary: auditLog.summary,
      })
      .from(auditLog)
      .orderBy(asc(auditLog.at), asc(auditLog.id));
  }

  function songForm(values: Record<string, string>) {
    return form({ artist: "", defaultKey: "", tempo: "", referenceUrl: "", notes: "", ...values });
  }

  it("logs the song library, and nothing for a rejected form or a song in use", async () => {
    requirePermission.mockResolvedValue({
      id: "staff",
      permissions: ["lam.songs_create", "lam.songs_update", "lam.songs_delete"],
    });
    expect(await createSong(undefined, songForm({ title: "" }))).toMatchObject({
      errors: { title: expect.any(String) },
    });
    await database.db
      .insert(lineupSongs)
      .values({ serviceId: "sunday", songId: "way-maker", position: 1 });
    await deleteSong("way-maker");
    expect(await entries()).toEqual([]);

    await expect(createSong(undefined, songForm({ title: "Firm Foundation" }))).rejects.toThrow(
      Redirect,
    );
    await expect(
      updateSong("unused", undefined, songForm({ title: "Build My Life", defaultKey: "G" })),
    ).rejects.toThrow(Redirect);
    await deleteSong("goodness");

    expect(await entries()).toMatchObject([
      { action: "song.create", entity: "song", summary: "Added Firm Foundation to the song library" },
      {
        action: "song.update",
        entityId: "unused",
        before: { defaultKey: null },
        after: { defaultKey: "G" },
        summary: "Edited song Build My Life: default key",
      },
      {
        action: "song.delete",
        entityId: "goodness",
        before: { title: "Goodness of God" },
        summary: "Deleted Goodness of God from the song library",
      },
    ]);
  });

  it("logs line-up changes against the service", async () => {
    await addLineupSong("sunday", undefined, form({ songId: "way-maker", songKey: "D" }));
    await addLineupSong("sunday", undefined, form({ songId: "goodness", songKey: "" }));
    const [first] = await database.db
      .select({ id: lineupSongs.id })
      .from(lineupSongs)
      .where(eq(lineupSongs.songId, "goodness"));
    await moveLineupSong("sunday", first.id, "up");
    await removeLineupSong("sunday", first.id);
    await addLineupAssignment("sunday", undefined, form({ memberId: "joy", part: "vocals" }));
    const [assignment] = await database.db.select({ id: lineupAssignments.id }).from(lineupAssignments);
    await removeLineupAssignment("sunday", assignment.id);

    const logged = await entries();
    expect(logged.every((entry) => entry.entity === "service" && entry.entityId === "sunday")).toBe(
      true,
    );
    expect(logged.map((entry) => [entry.action, entry.summary])).toEqual([
      ["lineup.songs_change", "Added Way Maker to the set list for Sunday"],
      ["lineup.songs_change", "Added Goodness of God to the set list for Sunday"],
      ["lineup.songs_change", "Moved Goodness of God up in the set list for Sunday"],
      ["lineup.songs_change", "Removed Goodness of God from the set list for Sunday"],
      ["lineup.team_change", "Put Joy Villanueva on Vocals for Sunday"],
      ["lineup.team_change", "Took Joy Villanueva off Vocals for Sunday"],
    ]);
  });

  it("logs nothing when a scheduling attempt is refused", async () => {
    await addLineupAssignment("sunday", undefined, form({ memberId: "mark", part: "keys" }));
    expect(await entries()).toEqual([]);
  });
});
