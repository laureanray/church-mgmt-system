import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "../../db/schema";

// Deliberately never falls back to DATABASE_URL, DIRECT_URL, or .env.
export function testDatabaseUrl() {
  const value = process.env.TEST_DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54432/church_mgmt_test";
  const url = new URL(value);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) ||
      url.pathname !== '/church_mgmt_test' || url.search !== '' || url.hash !== '' ||
      !['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error("Tests require a loopback Postgres URL with database church_mgmt_test");
  }
  return value;
}

export function connectTestDatabase() {
  const client = postgres(testDatabaseUrl(), { max: 5, connect_timeout: 5 });
  return { client, db: drizzle(client, { schema }) };
}

export async function migrateTestDatabase() {
  const { client, db } = connectTestDatabase();
  try {
    await migrate(db, { migrationsFolder: './db/migrations' });
  } finally {
    await client.end();
  }
}

export async function resetTestDatabase(client: ReturnType<typeof postgres>) {
  await client`TRUNCATE audit_log, attendance, ministry_members, lineup_assignments, lineup_songs, songs, members, cell_groups, services, service_schedules, users, app_settings CASCADE`;
  // The starter ministries are migration data, like the built-in roles, so they
  // stay; anything a test created goes.
  await client`DELETE FROM ministries WHERE id NOT IN ('lam', 'ushering', 'childrens-ministry')`;
}
