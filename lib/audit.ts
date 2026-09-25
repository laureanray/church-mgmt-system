import "server-only";

import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { auditChanges, changedFields, redact } from "@/lib/audit-diff";
import type { AuditAction, AuditEntity } from "@/lib/constants";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The client a mutation runs on — `db` itself, or the transaction it opened. */
export type DbExecutor = typeof db | Transaction;

export type AuditEntry = {
  actorId: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  /** The row before the change; omit on a create. */
  before?: Record<string, unknown> | null;
  /** The row after the change; omit on a delete. */
  after?: Record<string, unknown> | null;
  /** One line for the log's table. A function receives the changed fields. */
  summary: string | ((fields: string[]) => string);
};

/**
 * Append one audit entry.
 *
 * Call it with the mutation's own transaction, after the write: if the write
 * throws, the entry rolls back with it, and if the entry cannot be written the
 * change does not happen either. An update that changed nothing records
 * nothing — the return value is false then.
 *
 * Only the fields that moved are kept on an update, and anything whose name
 * says secret, password or token is redacted before it reaches the table.
 */
export async function recordAudit(
  executor: DbExecutor,
  entry: AuditEntry,
): Promise<boolean> {
  const changes = auditChanges(entry.before, entry.after);
  if (!changes) return false;

  const summary =
    typeof entry.summary === "function"
      ? entry.summary(changedFields(changes))
      : entry.summary;

  await executor.insert(auditLog).values({
    actorId: entry.actorId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    before: redact(changes.before),
    after: redact(changes.after),
    summary,
  });
  return true;
}
