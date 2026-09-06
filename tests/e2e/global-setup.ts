import { inArray } from "drizzle-orm";
import { hash } from "bcryptjs";
import { connectTestDatabase, migrateTestDatabase, resetTestDatabase } from "../support/database";
import { users, members, cellGroups } from "../../db/schema";

export default async function setup() {
  await migrateTestDatabase();
  const { client, db } = connectTestDatabase();
  try {
    await resetTestDatabase(client);
    const passwordHash = await hash('test-password-123', 10);
    await db.insert(users).values(
      (['admin', 'leader', 'usher'] as const).map(role => ({
        id: `e2e-${role}`, username: `e2e-${role}`, name: `Test ${role}`, role, passwordHash,
      })),
    );
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
