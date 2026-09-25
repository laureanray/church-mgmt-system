import { afterAll, beforeEach, expect, it, mock } from "bun:test";
import { asc } from "drizzle-orm";

import { connectTestDatabase, resetTestDatabase } from "../support/database";
import { lineupAssignments, lineupSongs, members, services, songs } from "../../db/schema";

const database = connectTestDatabase();
await mock.module("@/db", () => ({ db: database.db }));
const { lineupSummary } = await import("../../lib/lam-query");

beforeEach(() => resetTestDatabase(database.client));
afterAll(() => database.client.end());

it("summarises each service's own line-up", async () => {
  await database.db.insert(members).values([
    { id: "zed", fullName: "Zed Cruz", qrToken: "zed" },
    { id: "ana", fullName: "Ana Reyes", qrToken: "ana" },
    { id: "cy", fullName: "Cy Santos", qrToken: "cy" },
  ]);
  await database.db.insert(services).values([
    { id: "sunday", name: "Sunday", scheduledAt: new Date() },
    { id: "empty", name: "Empty", scheduledAt: new Date() },
  ]);
  await database.db.insert(songs).values([
    { id: "way-maker", title: "Way Maker" },
    { id: "goodness", title: "Goodness of God" },
  ]);
  await database.db.insert(lineupSongs).values([
    { serviceId: "sunday", songId: "way-maker", position: 1 },
    { serviceId: "sunday", songId: "goodness", position: 2 },
  ]);
  await database.db.insert(lineupAssignments).values([
    { serviceId: "sunday", memberId: "zed", part: "worship_leader" },
    { serviceId: "sunday", memberId: "ana", part: "worship_leader" },
    { serviceId: "sunday", memberId: "ana", part: "vocals" },
    { serviceId: "sunday", memberId: "cy", part: "keys" },
  ]);

  const rows = await database.db
    .select({ id: services.id, ...lineupSummary() })
    .from(services)
    .orderBy(asc(services.id));

  expect(rows).toEqual([
    { id: "empty", songCount: 0, teamCount: 0, leaders: [] },
    // Ana serves in two parts but is one person on the team.
    { id: "sunday", songCount: 2, teamCount: 3, leaders: ["Ana Reyes", "Zed Cruz"] },
  ]);
});
