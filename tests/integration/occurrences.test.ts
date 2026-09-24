import { afterAll, beforeEach, expect, it, mock } from "bun:test";
import { connectTestDatabase, resetTestDatabase } from "../support/database";
import { attendance, members, services, serviceSchedules } from "../../db/schema";

const database = connectTestDatabase();
await mock.module("@/db", () => ({ db: database.db }));
const { generateForSchedule, deleteFutureEmptyOccurrences, topUpAllSchedules } = await import("../../lib/occurrences");

beforeEach(() => resetTestDatabase(database.client));
afterAll(() => database.client.end());

it("generates upcoming occurrences idempotently, including simultaneous requests", async () => {
  // Tomorrow's weekday, so the schedule has exactly one upcoming occurrence.
  const dayOfWeek = (new Date().getDay() + 1) % 7;
  const [schedule] = await database.db.insert(serviceSchedules).values({
    name: 'Sunday', dayOfWeek, timeOfDay: '09:00',
  }).returning();
  const counts = await Promise.all([generateForSchedule(schedule), generateForSchedule(schedule)]);
  expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
  expect(await generateForSchedule(schedule)).toBe(0);
  expect(await database.db.select().from(services)).toHaveLength(1);
});

it("preserves past and attended occurrences when rebuilding a schedule", async () => {
  const [schedule] = await database.db.insert(serviceSchedules).values({ name: 'Sunday', dayOfWeek: 0, timeOfDay: '09:00' }).returning();
  const past = new Date(); past.setDate(past.getDate() - 7);
  const future = new Date(); future.setDate(future.getDate() + 7);
  const later = new Date(); later.setDate(later.getDate() + 14);
  await database.db.insert(services).values([
    { id: 'past', name: 'Past', scheduledAt: past, scheduleId: schedule.id },
    { id: 'attended', name: 'Attended', scheduledAt: future, scheduleId: schedule.id },
    { id: 'empty', name: 'Empty', scheduledAt: later, scheduleId: schedule.id },
    { id: 'unrelated', name: 'One-off', scheduledAt: later },
  ]);
  await database.db.insert(members).values({ id: 'member', fullName: 'Ana', qrToken: 'token' });
  await database.db.insert(attendance).values({ memberId: 'member', serviceId: 'attended' });
  await deleteFutureEmptyOccurrences(schedule.id);
  expect((await database.db.select().from(services)).map(s => s.id).sort()).toEqual(['attended', 'past', 'unrelated']);
  expect(await database.db.select().from(attendance)).toHaveLength(1);
});

it("does not top up paused schedules", async () => {
  await database.db.insert(serviceSchedules).values({ name: 'Paused', dayOfWeek: 0, timeOfDay: '09:00', active: false });
  expect(await topUpAllSchedules()).toBe(0);
  expect(await database.db.select().from(services)).toHaveLength(0);
});
