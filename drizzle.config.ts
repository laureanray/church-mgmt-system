import { defineConfig } from "drizzle-kit";

// Load .env for the drizzle-kit CLI (Node 20.6+ / 24).
try {
  process.loadEnvFile(".env");
} catch {
  // .env may be absent in CI where DATABASE_URL is already set.
}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "turso",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
  verbose: true,
  strict: true,
});
