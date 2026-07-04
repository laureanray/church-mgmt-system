import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";

import * as schema from "./schema";

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error("DATABASE_URL is not set");
}

// Reuse the libSQL client across hot reloads in dev and warm serverless
// invocations (Fluid Compute) to avoid re-creating connections.
const globalForDb = globalThis as unknown as {
  libsqlClient?: ReturnType<typeof createClient>;
};

const client =
  globalForDb.libsqlClient ??
  createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });

if (process.env.NODE_ENV !== "production") {
  globalForDb.libsqlClient = client;
}

export const db = drizzle(client, { schema });

export { schema };
