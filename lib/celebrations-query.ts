import "server-only";

import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { cellGroups, members } from "@/db/schema";
import {
  collectCelebrations,
  monthDayKeys,
  type Celebration,
  type CelebrationWindow,
} from "@/lib/celebrations";
import { PASTORAL_STATUSES, SPOUSE_RELEVANT_STATUSES } from "@/lib/constants";

/** `month * 100 + day` of a date column — the key `monthDayKeys` produces. */
function monthDay(column: PgColumn): SQL<number> {
  return sql<number>`(extract(month from ${column}) * 100 + extract(day from ${column}))::int`;
}

/**
 * The celebrations in `window`, soonest first.
 *
 * Postgres narrows the directory to members with a matching month and day, so
 * only they are loaded; `collectCelebrations` then decides which of each
 * member's dates actually fall in the window and in which year. The same rules
 * — pastoral statuses only, anniversaries only for the married — are applied in
 * both places, so the SQL is an optimisation and never the only guard.
 */
export async function celebrationsIn(
  window: CelebrationWindow,
): Promise<Celebration[]> {
  const keys = monthDayKeys(window);

  const rows = await db
    .select({
      id: members.id,
      fullName: members.fullName,
      status: members.status,
      maritalStatus: members.maritalStatus,
      birthdate: members.birthdate,
      spiritualBirthday: members.spiritualBirthday,
      weddingAnniversary: members.weddingAnniversary,
      cellGroupId: cellGroups.id,
      cellGroupName: cellGroups.name,
    })
    .from(members)
    .leftJoin(cellGroups, eq(members.cellGroupId, cellGroups.id))
    .where(
      and(
        inArray(members.status, PASTORAL_STATUSES),
        or(
          inArray(monthDay(members.birthdate), keys),
          inArray(monthDay(members.spiritualBirthday), keys),
          and(
            inArray(members.maritalStatus, SPOUSE_RELEVANT_STATUSES),
            inArray(monthDay(members.weddingAnniversary), keys),
          ),
        ),
      ),
    );

  return collectCelebrations(
    rows.map(({ cellGroupId, cellGroupName, ...member }) => ({
      ...member,
      cellGroup:
        cellGroupId && cellGroupName
          ? { id: cellGroupId, name: cellGroupName }
          : null,
    })),
    window,
  );
}
