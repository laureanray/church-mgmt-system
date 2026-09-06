import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error("DATABASE_URL is not set");
}

// Supabase's transaction pooler (Supavisor, port 6543) multiplexes connections
// and cannot hold server-side prepared statements, so postgres-js must not use
// them there. Direct and session-pooler connections (5432) keep them enabled.
const isTransactionPooler = new URL(url).port === "6543";

// Reuse the client across hot reloads in dev and warm serverless invocations
// (Fluid Compute) to avoid re-opening connections on every request.
const globalForDb = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.pgClient ??
  postgres(url, {
    prepare: !isTransactionPooler,
    // One socket per serverless instance keeps the pooler's connection budget
    // from being exhausted as instances scale out.
    max: process.env.NODE_ENV === "production" ? 1 : 5,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgClient = client;
}

export const db = drizzle(client, { schema });

export { schema };
