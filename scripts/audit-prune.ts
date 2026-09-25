// Delete audit entries older than AUDIT_RETENTION_MONTHS (lib/constants.ts).
//
// There is no cron in this app, so retention is a manual job, like the service
// top-up is a side effect of opening a page. Run it every few months:
//
//   bun run audit:prune            # delete
//   bun run audit:prune --dry-run  # count only
//
// Against production, run it with that project's DATABASE_URL in the
// environment.
import { AUDIT_RETENTION_MONTHS } from "../lib/constants";
import { retentionCutoff } from "../lib/audit-diff";

try {
  process.loadEnvFile(".env");
} catch {
  // Env already provided (CI, or a production shell).
}

async function main() {
  // Imported after the env is loaded: db/index.ts reads DATABASE_URL on first use.
  const { db } = await import("../db/index");
  const { auditLog } = await import("../db/schema");
  const { count, lt } = await import("drizzle-orm");

  const dryRun = process.argv.includes("--dry-run");
  const cutoff = retentionCutoff(new Date(), AUDIT_RETENTION_MONTHS);
  const expired = lt(auditLog.at, cutoff);

  if (dryRun) {
    const [{ n }] = await db.select({ n: count() }).from(auditLog).where(expired);
    console.log(`${n} audit entries predate ${cutoff.toISOString()}; nothing deleted.`);
  } else {
    const deleted = await db
      .delete(auditLog)
      .where(expired)
      .returning({ id: auditLog.id });
    console.log(
      `Deleted ${deleted.length} audit entries older than ${cutoff.toISOString()}.`,
    );
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
