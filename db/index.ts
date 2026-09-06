import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

type Database = ReturnType<typeof drizzle<typeof schema>>;

// Reuse the client across hot reloads in dev and warm serverless invocations
// (Fluid Compute) to avoid re-opening connections on every request.
const globalForDb = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>;
};

let instance: Database | undefined;

function connect(): Database {
  // POSTGRES_URL is injected by Vercel's Supabase integration and already points
  // at the transaction pooler. Preferring DATABASE_URL keeps local dev and any
  // non-Vercel host working, while the fallback means nothing has to be copied
  // by hand — which matters because the integration rotates these credentials.
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!url) {
    throw new Error("Set DATABASE_URL (or connect Vercel's Supabase integration)");
  }

  // Supabase's transaction pooler (Supavisor, port 6543) multiplexes connections
  // and cannot hold server-side prepared statements, so postgres-js must not use
  // them there. Direct and session-pooler connections (5432) keep them enabled.
  const isTransactionPooler = new URL(url).port === "6543";

  const client =
    globalForDb.pgClient ??
    postgres(url, {
      prepare: !isTransactionPooler,
      // Must stay >1. Against Supavisor a single socket deadlocks as soon as
      // two queries overlap — which pages do routinely via Promise.all — and
      // the connection is then destroyed. Supavisor multiplexes on its side, so
      // a small per-instance pool costs nothing.
      max: 5,
    });

  // Cached in production too, not just in dev. Next may evaluate this module
  // more than once per instance, and each fresh evaluation would otherwise open
  // its own pool — the opposite of what the comment on globalForDb promises.
  globalForDb.pgClient = client;

  return drizzle(client, { schema });
}

/**
 * Connects on first use rather than at import. `next build` evaluates every
 * route module to collect page data, so connecting eagerly would make the build
 * require database credentials — which Vercel preview deploys do not have.
 */
export const db = new Proxy({} as Database, {
  get(_target, prop) {
    instance ??= connect();
    const value = Reflect.get(instance, prop);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export { schema };
