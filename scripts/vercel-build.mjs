// Vercel runs `vercel-build` in preference to `build`.
// Apply DB migrations ONLY on production deploys, then build.
// Preview deploys skip migration (they point at a separate/no Supabase DB).
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

if (process.env.VERCEL_ENV === "production") {
  // Migrations run DDL, which Supabase's transaction pooler rejects. Without
  // DIRECT_URL drizzle-kit falls back to the pooled DATABASE_URL and fails
  // mid-migration, so stop here with a message that names the actual problem.
  if (!process.env.DIRECT_URL) {
    console.error(
      "[vercel-build] DIRECT_URL is not set. Point it at the Supabase session " +
        "pooler or direct connection (port 5432) — the transaction pooler " +
        "(6543) in DATABASE_URL cannot run migrations.",
    );
    process.exit(1);
  }

  console.log("[vercel-build] production — applying migrations");
  run("pnpm drizzle-kit migrate");
} else {
  console.log(
    `[vercel-build] VERCEL_ENV=${process.env.VERCEL_ENV} — skipping migrations`,
  );
}

run("pnpm next build");
