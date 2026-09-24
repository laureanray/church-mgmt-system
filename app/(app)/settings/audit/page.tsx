import { redirect } from "next/navigation";
import { and, asc, count, desc, eq, ilike, inArray } from "drizzle-orm";

import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { requirePermission } from "@/lib/auth-helpers";
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  AUDIT_RETENTION_MONTHS,
} from "@/lib/constants";
import {
  allowedValues,
  overRunPage,
  tableContext,
  tableHref,
  tableOffset,
  type RawSearchParams,
} from "@/lib/data-table";
import {
  AUDIT_SORT_KEYS,
  AuditLogTable,
  toAuditRow,
} from "@/components/audit/audit-log-table";
import { BackLink } from "@/components/patterns/back-link";
import { PageHeader } from "@/components/patterns/page-header";

const SORT_COLUMNS = {
  at: auditLog.at,
  action: auditLog.action,
} as const satisfies Record<(typeof AUDIT_SORT_KEYS)[number], unknown>;

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requirePermission("audit.view");

  const ctx = tableContext("/settings/audit", await searchParams, {
    sortKeys: [...AUDIT_SORT_KEYS],
    filterKeys: ["action", "entity"],
    filterValues: { action: AUDIT_ACTIONS, entity: AUDIT_ENTITIES },
    defaultSort: "at",
    defaultDirection: "desc",
  });
  const { state } = ctx;

  const actions = allowedValues(state.filters.action, AUDIT_ACTIONS);
  const entities = allowedValues(state.filters.entity, AUDIT_ENTITIES);
  const where = and(
    state.query ? ilike(auditLog.summary, `%${state.query}%`) : undefined,
    actions.length ? inArray(auditLog.action, actions) : undefined,
    entities.length ? inArray(auditLog.entity, entities) : undefined,
  );
  const direction = state.direction === "asc" ? asc : desc;

  const [rows, [{ matching }]] = await Promise.all([
    db
      .select({
        id: auditLog.id,
        at: auditLog.at,
        actorName: users.name,
        action: auditLog.action,
        entity: auditLog.entity,
        summary: auditLog.summary,
        before: auditLog.before,
        after: auditLog.after,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .where(where)
      // Entries written in one transaction share a timestamp; the id keeps a
      // LIMIT/OFFSET walk from repeating or skipping them between pages.
      .orderBy(
        direction(SORT_COLUMNS[state.sort as keyof typeof SORT_COLUMNS]),
        desc(auditLog.at),
        asc(auditLog.id),
      )
      .limit(state.perPage)
      .offset(tableOffset(state)),
    db.select({ matching: count() }).from(auditLog).where(where),
  ]);

  const clamped = overRunPage(state, matching);
  if (clamped !== null) redirect(tableHref(ctx, { page: clamped }));

  return (
    <div className="mx-auto max-w-6xl">
      <BackLink href="/settings" label="Back to settings" />
      <PageHeader
        title="Audit Log"
        description={`Who changed members, cell groups, staff, roles and settings. Entries are kept for ${AUDIT_RETENTION_MONTHS} months.`}
      />
      <AuditLogTable
        ctx={ctx}
        rows={rows.map(toAuditRow)}
        total={matching}
      />
    </div>
  );
}
