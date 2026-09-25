import "server-only";

import { and, asc, count, desc, eq, ilike, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";

import { db } from "@/db";
import { members } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { describeFields } from "@/lib/audit-diff";
import {
  DEFAULT_DIRECTORY_STATUSES,
  GENDERS,
  isLapsed,
  MARITAL_STATUSES,
  MEMBER_STATUS_LABELS,
  MEMBER_STATUSES,
} from "@/lib/constants";
import { MAX_PER_PAGE } from "@/lib/data-table";
import { memberSchema } from "@/lib/validators";

import { authorize, type Actor } from "./actor";
import { parseInput, ServiceError } from "./errors";
import { forgetMemberFaceBeforeDelete } from "./faces";

/**
 * Members: the one place their business rules live. The web app's pages and
 * server actions and the HTTP API under app/api/v1 all call these functions,
 * so a rule changed here changes for every client at once.
 *
 * Nothing in this file knows about requests, cookies, redirects, FormData or
 * revalidation — those belong to whichever adapter is calling.
 *
 * Every mutation writes its audit entry here, in its own transaction, so an
 * edit through the API is logged exactly like one through the web app.
 */

export type Member = typeof members.$inferSelect;

/** The sortable columns, by the name callers use for them. */
const SORT_COLUMNS = {
  name: members.fullName,
  gender: members.gender,
  marital: members.maritalStatus,
  since: members.memberSinceYear,
  contact: members.contactNumber,
} as const;

export const MEMBER_SORT_KEYS = Object.keys(SORT_COLUMNS) as [
  keyof typeof SORT_COLUMNS,
  ...(keyof typeof SORT_COLUMNS)[],
];

/** Longest name search the service accepts. */
export const MEMBER_SEARCH_MAX_LENGTH = 200;

export const memberListQuerySchema = z.object({
  search: z.string().trim().max(MEMBER_SEARCH_MAX_LENGTH).optional(),
  gender: z.array(z.enum(GENDERS)).optional(),
  marital: z.array(z.enum(MARITAL_STATUSES)).optional(),
  /**
   * Omitted means the directory's default view (active and visitors); an
   * empty list means every status, departed members included.
   */
  status: z.array(z.enum(MEMBER_STATUSES)).optional(),
  sort: z.enum(MEMBER_SORT_KEYS).default("name"),
  direction: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(MAX_PER_PAGE).default(20),
});

export type MemberListQuery = z.input<typeof memberListQuerySchema>;

export type MemberList = {
  rows: Member[];
  /** Rows matching the query across every page. */
  matching: number;
  /** Every member on record, regardless of the query. */
  total: number;
  page: number;
  perPage: number;
};

export async function listMembers(
  actor: Actor,
  input: MemberListQuery = {},
): Promise<MemberList> {
  authorize(actor, "members.view");
  const query = parseInput(memberListQuerySchema, input);

  const status = query.status ?? DEFAULT_DIRECTORY_STATUSES;
  const where = and(
    query.search ? ilike(members.fullName, `%${query.search}%`) : undefined,
    query.gender?.length ? inArray(members.gender, query.gender) : undefined,
    query.marital?.length
      ? inArray(members.maritalStatus, query.marital)
      : undefined,
    status.length ? inArray(members.status, status) : undefined,
  );
  const direction = query.direction === "asc" ? asc : desc;

  const [rows, [{ matching }], total] = await Promise.all([
    db
      .select()
      .from(members)
      .where(where)
      // A LIMIT/OFFSET walk over a non-unique sort column can repeat or skip
      // rows between pages; the id breaks every remaining tie.
      .orderBy(direction(SORT_COLUMNS[query.sort]), asc(members.id))
      .limit(query.perPage)
      .offset((query.page - 1) * query.perPage),
    db.select({ matching: count() }).from(members).where(where),
    db.$count(members),
  ]);

  return { rows, matching, total, page: query.page, perPage: query.perPage };
}

export async function getMember(actor: Actor, id: string): Promise<Member> {
  authorize(actor, "members.view");
  const member = await db.query.members.findFirst({
    where: eq(members.id, id),
  });
  if (!member) throw new ServiceError("not_found", "Member not found.");
  return member;
}

export async function createMember(
  actor: Actor,
  input: unknown,
): Promise<Member> {
  authorize(actor, "members.create");
  const data = parseInput(memberSchema, input);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(members)
      .values({ qrToken: nanoid(16), ...data })
      .returning();
    await recordAudit(tx, {
      actorId: actor.id,
      action: "member.create",
      entity: "member",
      entityId: row.id,
      after: row,
      summary: `Added ${row.fullName}`,
    });
    return row;
  });
}

/**
 * Replaces a member's editable fields. Returns the cell group the member was
 * in beforehand as well, since a move changes two rosters and the caller may
 * need to refresh both.
 */
export async function updateMember(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<{ member: Member; previousCellGroupId: string | null }> {
  authorize(actor, "members.update");
  const data = parseInput(memberSchema, input);

  return db.transaction(async (tx) => {
    // Locked so the "before" in the log is the row this update replaced, not
    // one a concurrent edit has already moved on from.
    const [previous] = await tx
      .select()
      .from(members)
      .where(eq(members.id, id))
      .for("update");
    if (!previous) throw new ServiceError("not_found", "Member not found.");

    const [member] = await tx
      .update(members)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(members.id, id))
      .returning();
    await recordAudit(tx, {
      actorId: actor.id,
      action:
        previous.status === member.status
          ? "member.update"
          : "member.status_change",
      entity: "member",
      entityId: id,
      before: previous,
      after: member,
      summary: (fields) => `Edited ${member.fullName}: ${describeFields(fields)}`,
    });

    return { member, previousCellGroupId: previous.cellGroupId };
  });
}

export async function deleteMember(actor: Actor, id: string): Promise<Member> {
  authorize(actor, "members.delete");
  // First, and outside the transaction: Tencent cannot roll back with it, and
  // a face left in the group after its member is gone could never be removed
  // from the member page again. If Tencent is down the deletion waits; the
  // face row then cascades away with the member.
  await forgetMemberFaceBeforeDelete(id);
  return db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(members)
      .where(eq(members.id, id))
      .returning();
    if (!deleted) throw new ServiceError("not_found", "Member not found.");
    await recordAudit(tx, {
      actorId: actor.id,
      action: "member.delete",
      entity: "member",
      entityId: id,
      before: deleted,
      summary: `Deleted ${deleted.fullName}`,
    });
    return deleted;
  });
}

/**
 * Mark a lapsed member active again — what check-in offers when someone who
 * had stopped attending walks back in. Only a lapsed status is replaced, so a
 * stale prompt cannot flip a member someone has since edited.
 */
export async function reactivateMember(
  actor: Actor,
  id: string,
): Promise<Member> {
  authorize(actor, "members.update");
  return db.transaction(async (tx) => {
    const [previous] = await tx
      .select()
      .from(members)
      .where(eq(members.id, id))
      .for("update");
    if (!previous || !isLapsed(previous.status)) {
      throw new ServiceError(
        "conflict",
        "This member’s status has already changed.",
      );
    }

    const [updated] = await tx
      .update(members)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(members.id, id))
      .returning();
    await recordAudit(tx, {
      actorId: actor.id,
      action: "member.status_change",
      entity: "member",
      entityId: id,
      before: previous,
      after: updated,
      summary: `Marked ${updated.fullName} active at check-in (was ${MEMBER_STATUS_LABELS[previous.status].toLowerCase()})`,
    });
    return updated;
  });
}
