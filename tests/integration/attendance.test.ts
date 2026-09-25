import { afterAll, beforeEach, expect, it, mock } from "bun:test";
import { connectTestDatabase, resetTestDatabase } from "../support/database";
import { attendance, cellGroups, members, services, users } from "../../db/schema";

const database = connectTestDatabase();
// bun's mock.module is not hoisted the way vi.mock is, so every mock has to be
// registered before the module under test is imported — hence the dynamic
// import below.
const requirePermission = mock();
await mock.module("@/db", () => ({ db: database.db }));
// Only requirePermission is replaced. bun keeps a module mock for the rest of
// the run, so dropping the other exports would leave requireUser undefined for
// whichever file happens to run next (require-user.test.ts).
const realAuthHelpers = await import("@/lib/auth-helpers");
await mock.module("@/lib/auth-helpers", () => ({
  ...realAuthHelpers,
  requirePermission,
}));
await mock.module("next/cache", () => ({ revalidatePath: mock() }));
const { checkInMember, recordAttendance, searchMembersForCheckIn } = await import(
  "../../app/(app)/scan/actions"
);

beforeEach(async () => {
  await resetTestDatabase(database.client);
  // A profile row only — Supabase Auth owns credentials, and requireUser is
  // mocked here, so no auth.users counterpart is needed for this test.
  await database.db.insert(users).values({ id: 'usher', email: 'usher@example.test', name: 'Usher' });
  await database.db.insert(members).values({ id: 'member', fullName: 'Ana Santos', qrToken: 'ana-token' });
  await database.db.insert(services).values({ id: 'service', name: 'Sunday', scheduledAt: new Date() });
  requirePermission.mockResolvedValue({
    id: 'usher', name: 'Usher', role: { id: 'usher', name: 'Usher' },
    permissions: ['attendance.record'], email: 'usher@example.test',
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
  requirePermission.mockRejectedValueOnce(new Error('unauthenticated'));
  await expect(recordAttendance('service', 'ana-token')).rejects.toThrow('unauthenticated');
  expect(await database.db.select().from(attendance)).toHaveLength(0);
});

it("checks in a member picked by name once, and reports the original time after", async () => {
  const first = await checkInMember('service', 'member');
  const second = await checkInMember('service', 'member');

  const rows = await database.db.select().from(attendance);
  expect(rows).toHaveLength(1);
  expect(rows[0].recordedBy).toBe('usher');
  expect(first).toEqual({
    status: 'ok', memberId: 'member', memberName: 'Ana Santos',
    memberStatus: 'active', at: rows[0].checkedInAt.toISOString(),
  });
  expect(second).toMatchObject({ status: 'duplicate', at: rows[0].checkedInAt.toISOString() });
});

it("refuses a missing service or member by name without writing attendance", async () => {
  expect(await checkInMember('', 'member')).toEqual({ status: 'error', message: 'No service selected.' });
  expect(await checkInMember('service', '')).toEqual({ status: 'error', message: 'No member selected.' });
  expect(await checkInMember('service', 'gone')).toEqual({ status: 'error', message: 'That member no longer exists.' });
  expect(await checkInMember('deleted-service', 'member')).toEqual({
    status: 'error', message: 'That service or member no longer exists.',
  });
  expect(await database.db.select().from(attendance)).toHaveLength(0);
});

it("refuses a check-in by name without the attendance permission", async () => {
  requirePermission.mockResolvedValueOnce({
    id: 'usher', name: 'Usher', role: { id: 'viewer', name: 'Viewer' },
    permissions: ['attendance.view'], email: 'usher@example.test',
    mustChangePassword: false,
  });
  await expect(checkInMember('service', 'member')).rejects.toThrow('You do not have permission');
  expect(await database.db.select().from(attendance)).toHaveLength(0);
});

it("searches names case-insensitively, with what tells namesakes apart", async () => {
  await database.db.insert(cellGroups).values({ id: 'joshua', name: 'Joshua Cell' });
  await database.db.update(members).set({ cellGroupId: 'joshua', birthdate: '1994-05-01' });
  await database.db.insert(members).values([
    { id: 'dennis', fullName: 'Dennis Santos', qrToken: 'dennis-token', status: 'inactive' },
    { id: 'ruth', fullName: 'Ruth Villanueva', qrToken: 'ruth-token' },
  ]);

  expect(await searchMembersForCheckIn('SANTOS')).toEqual([
    { id: 'member', fullName: 'Ana Santos', status: 'active', cellGroupName: 'Joshua Cell', birthYear: 1994 },
    { id: 'dennis', fullName: 'Dennis Santos', status: 'inactive', cellGroupName: null, birthYear: null },
  ]);
});

it("needs two characters, caps the list and treats wildcards literally", async () => {
  await database.db.insert(members).values(
    Array.from({ length: 12 }, (_, i) => ({
      id: `santos-${i}`, fullName: `Santos ${String(i).padStart(2, '0')}`, qrToken: `santos-${i}`,
    })),
  );

  expect(await searchMembersForCheckIn('s')).toEqual([]);
  expect(await searchMembersForCheckIn('santos')).toHaveLength(10);
  expect(await searchMembersForCheckIn('%%')).toEqual([]);
  expect(await searchMembersForCheckIn('__')).toEqual([]);
});
