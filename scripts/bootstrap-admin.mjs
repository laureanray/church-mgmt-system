// Create the first admin account.
//
// Migration 0001 removes the Auth.js-era staff rows, and /users needs an
// existing admin to sign in, so a freshly migrated database has no way in.
// This closes that gap without putting a default credential in the seed, which
// production must never carry.
//
// Usage:
//   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='…' bun run bootstrap:admin
//
// Against production, run it with that project's DATABASE_URL /
// NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment.
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

try {
  process.loadEnvFile(".env");
} catch {
  // Env already provided (CI, or a production shell).
}

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME ?? "Church Admin";

if (!email || !password) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD.");
  process.exit(1);
}
if (password.length < 8) {
  console.error("ADMIN_PASSWORD must be at least 8 characters.");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!databaseUrl || !supabaseUrl || !serviceRoleKey) {
  console.error(
    "Need DATABASE_URL (or POSTGRES_URL), NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
  );
  process.exit(1);
}

const sql = postgres(databaseUrl, { prepare: false, max: 2 });
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

try {
  const [{ count }] = await sql`select count(*)::int as count from users`;
  if (count > 0) {
    console.error(
      `Refusing to run: ${count} staff account(s) already exist. Use /users instead.`,
    );
    process.exit(1);
  }

  // Supabase owns the credential, so it goes first — its id is the profile key.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(error?.message ?? "Supabase returned no user");
  }

  try {
    await sql`
      insert into users (id, name, email, role, must_change_password)
      values (${data.user.id}, ${name}, ${email}, 'admin', false)`;
  } catch (err) {
    // Leave no auth user without a profile — it could sign in but get nowhere.
    await admin.auth.admin.deleteUser(data.user.id);
    throw err;
  }

  console.log(`Created admin ${email}. Sign in and change the password.`);
} finally {
  await sql.end();
}
