// Preloaded once per `bun test` run (see the test:integration script), before
// any integration file loads. Applies the committed Drizzle migrations to the
// disposable test database — bun's replacement for vitest's globalSetup.
import { migrateTestDatabase } from "./database";

await migrateTestDatabase();
