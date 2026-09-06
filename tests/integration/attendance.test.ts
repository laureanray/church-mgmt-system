import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { connectTestDatabase, resetTestDatabase } from "../support/database";
import { attendance, members, services, users } from "../../db/schema";

const database = connectTestDatabase();
vi.mock("@/db", () => ({ db: database.db }));
vi.mock("@/lib/auth-helpers", () => ({ requireUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const { recordAttendance } = await import("../../app/(app)/scan/actions");
const { requireUser } = await import("../../lib/auth-helpers");

beforeEach(async () => {
  await resetTestDatabase(database.client);
  // A profile row only — Supabase Auth owns credentials, and requireUser is
  // mocked here, so no auth.users counterpart is needed for this test.
  await database.db.insert(users).values({ id: 'usher', email: 'usher@example.test', name: 'Usher' });
  await database.db.insert(members).values({ id: 'member', fullName: 'Ana Santos', qrToken: 'ana-token' });
  await database.db.insert(services).values({ id: 'service', name: 'Sunday', scheduledAt: new Date() });
  vi.mocked(requireUser).mockResolvedValue({
    id: 'usher', name: 'Usher', role: 'usher', email: 'usher@example.test',
    mustChangePassword: false,
  });
});
afterAll(() => database.client.end());

it("deduplicates concurrent scans in Postgres and returns the original timestamp", async () => {
  const results = await Promise.all([
    recordAttendance('service', 'ana-token'),
    recordAttendance('service', 'https://example.test/?token=ana-token'),
  ]);
  expect(results.map(r => r.status).sort()).toEqual(['duplicate', 'ok']);
  const rows = await database.db.select().from(attendance);
  expect(rows).toHaveLength(1);
  expect(rows[0].recordedBy).toBe('usher');
  for (const result of results) {
    expect(result).toMatchObject({ memberId: 'member', memberName: 'Ana Santos', at: rows[0].checkedInAt.toISOString() });
  }
});

it("rejects missing services, empty codes and unknown members without writing attendance", async () => {
  expect(await recordAttendance('', 'ana-token')).toMatchObject({ status: 'error' });
  expect(await recordAttendance('service', '  ')).toMatchObject({ status: 'error' });
  expect(await recordAttendance('service', 'unknown')).toEqual({ status: 'not_found', token: 'unknown' });
  expect(await database.db.select().from(attendance)).toHaveLength(0);
});

it("requires authentication before recording attendance", async () => {
  vi.mocked(requireUser).mockRejectedValueOnce(new Error('unauthenticated'));
  await expect(recordAttendance('service', 'ana-token')).rejects.toThrow('unauthenticated');
  expect(await database.db.select().from(attendance)).toHaveLength(0);
});
