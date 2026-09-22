import { eq, inArray } from "drizzle-orm";
import { connectTestDatabase, migrateTestDatabase, resetTestDatabase } from "../support/database";
import { testAdminClient, testEmail, TEST_PASSWORD } from "../support/auth";
import { users, members, cellGroups, roles } from "../../db/schema";

const ROLES = ['admin', 'leader', 'usher'] as const;

export default async function setup() {
  await migrateTestDatabase();
  const { client, db } = connectTestDatabase();
  const admin = testAdminClient();
  try {
    await resetTestDatabase(client);
    await db.delete(roles).where(eq(roles.isSystem, false));

    // Supabase Auth owns credentials, so each staff account is created in
    // GoTrue first and its id becomes the profile's primary key — the same
    // two-step the app performs in app/(app)/users/actions.ts.
    for (const role of ROLES) {
      const email = testEmail(role);

      // auth.users survives resetTestDatabase (it truncates public tables
      // only), so drop any account left by a previous run before recreating.
      const { data: existing } = await admin.auth.admin.listUsers();
      const stale = existing?.users.find(u => u.email === email);
      if (stale) await admin.auth.admin.deleteUser(stale.id);

      const { data, error } = await admin.auth.admin.createUser({
        email, password: TEST_PASSWORD, email_confirm: true,
      });
      if (error || !data.user) {
        throw new Error(`Could not create the ${role} test account: ${error?.message}`);
      }

      await db.insert(users).values({
        id: data.user.id, name: `Test ${role}`, email, roleId: role,
      });
    }

    await db.insert(members).values([
      { id: 'e2e-cell-leader', fullName: 'E2E Cell Leader', qrToken: 'e2e-leader-token' },
      { id: 'e2e-cell-member', fullName: 'E2E Cell Member', qrToken: 'e2e-member-token' },
    ]);
    await db.insert(cellGroups).values({ id: 'e2e-cell', name: 'E2E Cell', leaderId: 'e2e-cell-leader' });
    await db.update(members).set({ cellGroupId: 'e2e-cell' })
      .where(inArray(members.id, ['e2e-cell-leader', 'e2e-cell-member']));
  } finally {
    await client.end();
  }
}
