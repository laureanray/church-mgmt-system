import { afterAll, beforeEach, expect, it, mock } from "bun:test";
import { eq } from "drizzle-orm";

import { connectTestDatabase, resetTestDatabase } from "../support/database";
import { rolePermissions, roles, users } from "../../db/schema";

// requireUser reads the profile, role and permissions in one query; these
// tests hold that single query to the answers the old two-query version gave.
// Only the identity half is mocked — the roles and permissions are the ones the
// migrations seed.
const database = connectTestDatabase();
let signedInAs: string | null = null;
await mock.module("@/db", () => ({ db: database.db }));
await mock.module("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
await mock.module("@/lib/supabase/verify", () => ({
  verifiedUserId: async () => signedInAs,
  verifyAccessToken: async () => null,
}));
await mock.module("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
const { requireUser } = await import("../../lib/auth-helpers");

const EMPTY_ROLE = "test-empty-role";

beforeEach(async () => {
  await resetTestDatabase(database.client);
  await database.db.delete(roles).where(eq(roles.id, EMPTY_ROLE));
  signedInAs = null;
});
afterAll(async () => {
  await database.db.delete(roles).where(eq(roles.id, EMPTY_ROLE));
  await database.client.end();
});

it("returns the profile with exactly its role's permissions", async () => {
  await database.db.insert(users).values({
    id: "leader-user", email: "leader@example.test", name: "Lea Der", roleId: "leader",
  });
  signedInAs = "leader-user";

  const user = await requireUser();
  const granted = await database.db
    .select({ key: rolePermissions.permissionKey })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, "leader"));

  expect(user).toMatchObject({
    id: "leader-user",
    name: "Lea Der",
    email: "leader@example.test",
    role: { id: "leader", name: "Leader" },
    mustChangePassword: false,
  });
  expect(granted.length).toBeGreaterThan(0);
  expect<string[]>([...user.permissions].sort()).toEqual(
    granted.map((g) => g.key).sort(),
  );
});

it("gives a role with no permissions an empty list, not [null]", async () => {
  await database.db.insert(roles).values({ id: EMPTY_ROLE, name: "Nobody" });
  await database.db.insert(users).values({
    id: "empty-user", email: "empty@example.test", name: "Empty", roleId: EMPTY_ROLE,
  });
  signedInAs = "empty-user";

  expect((await requireUser()).permissions).toEqual([]);
});

it("sends a signed-in user without a profile row to /no-access", async () => {
  signedInAs = "no-profile";
  expect(requireUser()).rejects.toThrow("redirect:/no-access");
});

it("sends a visitor without a session to /login", async () => {
  expect(requireUser()).rejects.toThrow("redirect:/login");
});
