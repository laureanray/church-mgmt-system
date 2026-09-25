import { afterAll, beforeEach, expect, it } from "bun:test";
import { asc } from "drizzle-orm";

import { connectTestDatabase, resetTestDatabase } from "../support/database";
import { services, serviceSchedules } from "../../db/schema";

/*
 * Migration 0011 moves services written by a UTC server to the instant the
 * church meant, and leaves a database written in Manila time alone. The
 * preload has already applied it to an empty database, so here it is re-run
 * by hand against data shaped each way.
 */

const database = connectTestDatabase();
const migration = await Bun.file("db/migrations/0011_church_time_services.sql").text();

beforeEach(() => resetTestDatabase(database.client));
afterAll(() => database.client.end());

async function scheduledAt() {
  const rows = await database.db
    .select({ id: services.id, at: services.scheduledAt })
    .from(services)
    .orderBy(asc(services.id));
  return Object.fromEntries(rows.map((row) => [row.id, row.at.toISOString()]));
}

async function sundayNine() {
  const [schedule] = await database.db
    .insert(serviceSchedules)
    .values({ name: "Sunday Service", dayOfWeek: 0, timeOfDay: "09:00" })
    .returning();
  return schedule.id;
}

it("moves every service of a UTC-written database eight hours earlier", async () => {
  const scheduleId = await sundayNine();
  // What production held: 9 AM read as UTC, i.e. 5 PM in Manila.
  await database.db.insert(services).values([
    { id: "a-generated", name: "Sunday Service", scheduleId, scheduledAt: new Date("2026-09-20T09:00:00Z") },
    { id: "b-generated", name: "Sunday Service", scheduleId, scheduledAt: new Date("2026-09-27T09:00:00Z") },
    // A one-off typed in as 6:30 PM went in as 18:30 UTC too.
    { id: "c-one-off", name: "Youth Night", scheduledAt: new Date("2026-09-25T18:30:00Z") },
  ]);

  await database.client.unsafe(migration);

  expect(await scheduledAt()).toEqual({
    "a-generated": "2026-09-20T01:00:00.000Z",
    "b-generated": "2026-09-27T01:00:00.000Z",
    "c-one-off": "2026-09-25T10:30:00.000Z",
  });
});

it("leaves a database written in Manila time alone", async () => {
  const scheduleId = await sundayNine();
  await database.db.insert(services).values([
    { id: "a-generated", name: "Sunday Service", scheduleId, scheduledAt: new Date("2026-09-27T01:00:00Z") },
    { id: "b-one-off", name: "Youth Night", scheduledAt: new Date("2026-09-25T10:30:00Z") },
  ]);

  await database.client.unsafe(migration);

  expect(await scheduledAt()).toEqual({
    "a-generated": "2026-09-27T01:00:00.000Z",
    "b-one-off": "2026-09-25T10:30:00.000Z",
  });
});

it("moves occurrences eight hours apart without tripping the unique constraint", async () => {
  // A schedule moved from 9 AM to 5 PM keeps its old occurrence, so the same
  // schedule holds rows exactly eight hours apart.
  // The later row goes in first, so a single UPDATE reaching it first would
  // move it onto the earlier row's slot while that row still holds it.
  const scheduleId = await sundayNine();
  await database.db.insert(services).values(
    { id: "b-late", name: "Sunday Service", scheduleId, scheduledAt: new Date("2026-09-27T17:00:00Z") },
  );
  await database.db.insert(services).values(
    { id: "a-early", name: "Sunday Service", scheduleId, scheduledAt: new Date("2026-09-27T09:00:00Z") },
  );

  await database.client.unsafe(migration);

  expect(await scheduledAt()).toEqual({
    "a-early": "2026-09-27T01:00:00.000Z",
    "b-late": "2026-09-27T09:00:00.000Z",
  });
});

it("changes nothing without generated occurrences to judge by", async () => {
  await database.db.insert(services).values({
    id: "one-off",
    name: "Youth Night",
    scheduledAt: new Date("2026-09-25T18:30:00Z"),
  });

  await database.client.unsafe(migration);

  expect(await scheduledAt()).toEqual({ "one-off": "2026-09-25T18:30:00.000Z" });
});
