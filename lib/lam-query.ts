import "server-only";

import { eq, getTableName, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { lineupAssignments, lineupSongs, members, services } from "@/db/schema";

/**
 * `"table"."column"`. Drizzle leaves columns unqualified in a single-table
 * select, so inside a correlated subquery a bare "id" or "service_id" binds to
 * the inner table instead of the outer row — silently, when both have one.
 */
function qualified(column: AnyPgColumn) {
  return sql`${sql.identifier(getTableName(column.table))}.${sql.identifier(column.name)}`;
}

const serviceId = qualified(services.id);
const assignmentService = qualified(lineupAssignments.serviceId);
const assignedMember = qualified(lineupAssignments.memberId);
const memberName = qualified(members.fullName);

/**
 * Per-service line-up columns for a select over `services`. They are
 * subqueries of the row query rather than a follow-up query, so a page of
 * line-ups stays one batch. A function, not a constant: `db.$count` touches the
 * connection, which must not happen at import during the build.
 */
export const lineupSummary = () => ({
  songCount: db.$count(lineupSongs, eq(lineupSongs.serviceId, services.id)),
  /** People on the team, each counted once however many parts they cover. */
  teamCount: sql<number>`(
    select count(distinct ${assignedMember})
    from ${lineupAssignments}
    where ${assignmentService} = ${serviceId}
  )`.mapWith(Number),
  /** Worship leaders' names, alphabetical. */
  leaders: sql<string[]>`coalesce(
    (select array_agg(${memberName} order by ${memberName})
      from ${lineupAssignments}
      join ${members} on ${qualified(members.id)} = ${assignedMember}
      where ${assignmentService} = ${serviceId}
        and ${qualified(lineupAssignments.part)} = 'worship_leader'),
    '{}'
  )`,
});
