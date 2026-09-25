"use server";

import { and, eq, isNull, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { members, roles, users } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { describeFields } from "@/lib/audit-diff";
import { requirePermission } from "@/lib/auth-helpers";
import { generateTempPassword } from "@/lib/password";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserSchema, editUserSchema, fieldErrors } from "@/lib/validators";

const MEMBER_ALREADY_LINKED = "That member is already linked to another staff login.";

/**
 * Checks a member can be linked to this login: it exists, and no other login
 * already claims it. This is the early, friendly answer for the form; the
 * claim itself is re-checked atomically in linkMember, because two staff can
 * pass this check for the same member at the same moment.
 */
async function linkableMemberError(
  memberId: string | null,
  userId: string | null,
): Promise<string | null> {
  if (!memberId) return null;
  const member = await db.query.members.findFirst({
    where: eq(members.id, memberId),
    columns: { userId: true },
  });
  if (!member) return "That member no longer exists.";
  if (member.userId && member.userId !== userId) {
    return MEMBER_ALREADY_LINKED;
  }
  return null;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Thrown inside a transaction to roll it back when the claim is lost. */
class MemberAlreadyLinked extends Error {}

/**
 * Points exactly one member record (or none) at this login.
 *
 * The claim only succeeds while the member is unclaimed or already this
 * login's, and it must touch a row — so a concurrent link to the same member
 * rolls this transaction back instead of silently taking the member over,
 * which would move its ministry access from one login to another.
 */
async function linkMember(tx: Tx, userId: string, memberId: string | null) {
  await tx
    .update(members)
    .set({ userId: null, updatedAt: new Date() })
    .where(
      memberId
        ? and(eq(members.userId, userId), ne(members.id, memberId))
        : eq(members.userId, userId),
    );
  if (memberId) {
    const claimed = await tx
      .update(members)
      .set({ userId, updatedAt: new Date() })
      .where(
        and(
          eq(members.id, memberId),
          or(isNull(members.userId), eq(members.userId, userId)),
        ),
      )
      .returning({ id: members.id });
    if (claimed.length === 0) throw new MemberAlreadyLinked();
  }
}

export type CreateUserState =
  | {
      ok?: boolean;
      email?: string;
      tempPassword?: string;
      errors?: Record<string, string>;
      message?: string;
    }
  | undefined;

export async function createUser(
  _prev: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  const actor = await requirePermission("users.create");

  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    roleId: formData.get("roleId"),
    memberId: formData.get("memberId"),
  });
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  const { name, email, roleId, memberId } = parsed.data;

  const assignedRole = await db.query.roles.findFirst({
    where: eq(roles.id, roleId),
  });
  if (!assignedRole) {
    return { errors: { roleId: "Select an available role." } };
  }

  const memberError = await linkableMemberError(memberId, null);
  if (memberError) return { errors: { memberId: memberError } };

  const taken = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (taken) {
    return { errors: { email: "That email is already in use." } };
  }

  const tempPassword = generateTempPassword();
  const admin = createAdminClient();

  // Supabase owns the credential, so it has to be created first — we need the
  // id it assigns as the profile's primary key.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    // No mail server is configured for staff onboarding; the admin hands over
    // the temporary password directly, so skip the confirmation round trip.
    email_confirm: true,
  });

  if (error || !data.user) {
    return {
      errors: { email: error?.message ?? "Could not create the account." },
    };
  }

  try {
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({
          id: data.user.id,
          name,
          email,
          roleId,
          mustChangePassword: true,
        })
        .returning();
      await recordAudit(tx, {
        actorId: actor.id,
        action: "user.create",
        entity: "user",
        entityId: created.id,
        after: created,
        summary: `Created staff account for ${name} (${assignedRole.name})`,
      });
      await linkMember(tx, data.user.id, memberId);
    });
  } catch (err) {
    // Roll the auth user back, otherwise it lingers with no profile and its
    // owner can sign in but gets bounced by requireUser().
    await admin.auth.admin.deleteUser(data.user.id);
    if (err instanceof MemberAlreadyLinked) {
      return { errors: { memberId: MEMBER_ALREADY_LINKED } };
    }
    throw err;
  }

  revalidatePath("/users");
  if (memberId) revalidatePath(`/members/${memberId}`);
  return { ok: true, email, tempPassword };
}

export type EditUserState =
  | { errors?: Record<string, string>; message?: string }
  | undefined;

export async function updateUser(
  id: string,
  _prev: EditUserState,
  formData: FormData,
): Promise<EditUserState> {
  const currentUser = await requirePermission("users.update");

  const parsed = editUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    roleId: formData.get("roleId"),
    memberId: formData.get("memberId"),
  });
  if (!parsed.success) {
    return {
      errors: fieldErrors(parsed.error),
      message: "Please fix the highlighted fields.",
    };
  }

  const { name, email, roleId, memberId } = parsed.data;

  const assignedRole = await db.query.roles.findFirst({
    where: eq(roles.id, roleId),
  });
  if (!assignedRole) {
    return { errors: { roleId: "Select an available role." } };
  }

  const memberError = await linkableMemberError(memberId, id);
  if (memberError) return { errors: { memberId: memberError } };

  const clash = await db.query.users.findFirst({
    where: and(eq(users.email, email), ne(users.id, id)),
  });
  if (clash) {
    return { errors: { email: "That email is already in use." } };
  }

  const existing = await db.query.users.findFirst({
    where: eq(users.id, id),
  });

  if (existing && id === currentUser.id && existing.roleId !== roleId) {
    return {
      errors: { roleId: "You cannot change your own role." },
      message: "Ask another authorized staff member to change your role.",
    };
  }

  // Ministry access arrives through the linked member, so relinking yourself is
  // the same self-escalation as changing your own role.
  if (id === currentUser.id && (currentUser.memberId ?? null) !== memberId) {
    return {
      errors: { memberId: "You cannot change your own member record." },
      message: "Ask another authorized staff member to link your member record.",
    };
  }

  // Email is the login identity, so a change has to reach Supabase too, or the
  // staff member would keep signing in with the old address.
  const previousEmail =
    existing && existing.email !== email ? existing.email : null;
  if (previousEmail) {
    const { error } = await createAdminClient().auth.admin.updateUserById(id, {
      email,
      email_confirm: true,
    });
    if (error) {
      return { errors: { email: error.message } };
    }
  }

  // The linked member carries ministry access, so relinking can change what
  // this user may do exactly as a role change can.
  try {
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(users)
        .set({ name, email, roleId, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();
      await linkMember(tx, id, memberId);
      if (!existing || !updated) return;

      const roleChanged = existing.roleId !== updated.roleId;
      await recordAudit(tx, {
        actorId: currentUser.id,
        action: roleChanged ? "user.role_change" : "user.update",
        entity: "user",
        entityId: id,
        before: existing,
        after: updated,
        summary: (fields) => {
          const others = describeFields(fields.filter((field) => field !== "roleId"));
          if (!roleChanged) return `Edited staff user ${name}: ${others}`;
          const role = `Changed ${name}’s role to ${assignedRole.name}`;
          return others ? `${role}, and edited ${others}` : role;
        },
      });
    });
  } catch (err) {
    // The profile rolled back, so put the login email back too; otherwise the
    // staff member signs in with an address the profile does not show.
    const restore = previousEmail
      ? await createAdminClient().auth.admin.updateUserById(id, {
          email: previousEmail,
          email_confirm: true,
        })
      : null;
    // Supabase refused the old address, so it keeps the new one. The profile
    // is the half we can still move: bring its email into line, and say so.
    const emailKept = Boolean(restore?.error);
    if (emailKept) {
      await db
        .update(users)
        .set({ email, updatedAt: new Date() })
        .where(eq(users.id, id));
      revalidatePath("/users");
    }
    if (err instanceof MemberAlreadyLinked) {
      return {
        errors: { memberId: MEMBER_ALREADY_LINKED },
        ...(emailKept && {
          message: "The new email was saved, but nothing else was. Pick another member record.",
        }),
      };
    }
    throw err;
  }

  revalidatePath("/users");
  revalidatePath("/members", "layout");
  redirect("/users");
}

export type ResetPasswordState =
  | { email: string; tempPassword: string }
  | undefined;

export async function resetUserPassword(
  id: string,
  _prev: ResetPasswordState,
): Promise<ResetPasswordState> {
  const actor = await requirePermission("users.reset_password");

  const tempPassword = generateTempPassword();
  const admin = createAdminClient();

  const { error } = await admin.auth.admin.updateUserById(id, {
    password: tempPassword,
  });
  if (error) {
    throw new Error(`Could not reset the password: ${error.message}`);
  }

  // Neither the temporary password nor anything derived from it is logged —
  // only that one was issued, and to whom.
  const updated = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({ mustChangePassword: true, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning({ name: users.name, email: users.email });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "user.password_reset",
      entity: "user",
      entityId: id,
      summary: `Issued a temporary password to ${updated.name}`,
    });
    return updated;
  });

  revalidatePath("/users");
  return { email: updated.email, tempPassword };
}

export async function deleteUser(currentUserId: string, id: string) {
  const actor = await requirePermission("users.delete");
  if (id === currentUserId || id === actor.id) {
    // Guard against locking yourself out.
    return;
  }

  // Delete the credential first: a profile with no auth user is merely orphaned
  // data, while an auth user with no profile is an account that can still sign
  // in. requireUser() rejects the latter, but leaving one around is worse.
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    throw new Error(`Could not delete the account: ${error.message}`);
  }

  await db.transaction(async (tx) => {
    const [deleted] = await tx.delete(users).where(eq(users.id, id)).returning();
    if (!deleted) return;
    await recordAudit(tx, {
      actorId: actor.id,
      action: "user.delete",
      entity: "user",
      entityId: id,
      before: deleted,
      summary: `Deleted staff account for ${deleted.name}`,
    });
  });
  revalidatePath("/users");
}
