import { defineConfig } from "drizzle-kit";

// Load .env for the drizzle-kit CLI (Node 20.6+ / 24).
try {
  process.loadEnvFile(".env");
} catch {
  // .env may be absent in CI where DATABASE_URL is already set.
}

// Migrations run DDL, which the transaction pooler does not support. Point
// DIRECT_URL at the direct or session-pooler connection; locally the Supabase
// CLI stack serves both from the same address, so DATABASE_URL is the fallback.
const url = process.env.DIRECT_URL || process.env.DATABASE_URL!;

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  verbose: true,
  strict: true,
});
