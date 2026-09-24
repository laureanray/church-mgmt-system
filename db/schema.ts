import { relations } from "drizzle-orm";
import {
  AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums are modeled as text columns with a TS-level enum constraint. DB-level
// enforcement is intentionally omitted; validation lives in lib/validators.ts
// (zod). Keep these arrays in sync with lib/constants.ts.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Roles and permissions — application authorization
// ---------------------------------------------------------------------------

export const roles = pgTable("roles", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  description: text("description"),
  // Built-in roles keep stable ids for migration and cannot be deleted. The
  // Admin role is additionally protected from permission changes in actions.
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const permissions = pgTable("permissions", {
  key: text("key").primaryKey(),
  module: text("module").notNull(),
  action: text("action").notNull(),
  label: text("label").notNull(),
  description: text("description").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionKey: text("permission_key")
      .notNull()
      .references(() => permissions.key, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.permissionKey] }),
    index("role_permissions_permission_key_idx").on(table.permissionKey),
  ],
);

// ---------------------------------------------------------------------------
// Users — staff who log in and receive access through one role
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  // The Supabase Auth user id (a UUID), not generated here — a row only exists
  // once auth.users has one. Kept as text so the foreign keys pointing at it
  // from members.user_id and attendance.recorded_by stay unchanged.
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  // Login identity, mirrored from auth.users so staff can be listed and
  // searched without a round trip to the Auth admin API. Supabase remains the
  // source of truth; app/(app)/users/actions.ts writes both together.
  email: text("email").notNull().unique(),
  roleId: text("role_id")
    .notNull()
    .default("usher")
    .references(() => roles.id, { onDelete: "restrict" }),
  // True when an admin has issued a temporary password; forces a reset at login.
  // Supabase Auth has no equivalent, so the flag stays app-side.
  mustChangePassword: boolean("must_change_password")
    .notNull()
    .default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [index("users_role_id_idx").on(table.roleId)]);

// ---------------------------------------------------------------------------
// Members — the church congregation. Each has a unique QR token.
// ---------------------------------------------------------------------------

export const members = pgTable(
  "members",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // Unique token encoded into the member's QR code.
    qrToken: text("qr_token").notNull().unique(),

    fullName: text("full_name").notNull(),
    // Nullable for legacy records: never guess boundaries in an existing name.
    firstName: text("first_name"),
    middleName: text("middle_name"),
    lastName: text("last_name"),
    birthdate: date("birthdate"),
    spiritualBirthday: date("spiritual_birthday"),
    // "Taon na naging Kaanib ng IRM" — year the member joined IRM.
    memberSinceYear: integer("member_since_year"),
    gender: text("gender", { enum: ["male", "female"] }),
    maritalStatus: text("marital_status", {
      enum: ["single", "married", "widowed", "separated", "divorced"],
    }),
    // Lifecycle, not marital status. Counts, reports and celebrations read this
    // to leave out people who have moved away or passed on; see
    // MEMBER_STATUSES in lib/constants.ts for what each value means.
    status: text("status", {
      enum: ["active", "visitor", "inactive", "transferred", "deceased"],
    })
      .notNull()
      .default("active"),
    spouseName: text("spouse_name"),
    weddingAnniversary: date("wedding_anniversary"),
    contactNumber: text("contact_number"),
    homeAddress: text("home_address"),
    motherName: text("mother_name"),
    fatherName: text("father_name"),
    educationalLevel: text("educational_level"),
    occupation: text("occupation"),

    // The cell group this person belongs to. NULL = not yet in any cell group.
    cellGroupId: text("cell_group_id").references(
      (): AnyPgColumn => cellGroups.id,
      {
        onDelete: "set null",
      },
    ),
    // Links a member to their staff login, when they also log in. No UI in v1.
    userId: text("user_id")
      .references(() => users.id, { onDelete: "set null" })
      .unique(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Every listing of the directory sorts by name, and /members pairs that with
    // a LIMIT — without this the whole table is sorted to return 200 rows.
    index("members_full_name_idx").on(t.fullName),
    // Read by the cell-group pages; also what makes deleting a cell group (which
    // nulls this column) an indexed update rather than a scan.
    index("members_cell_group_id_idx").on(t.cellGroupId),
    // The directory's default view and the dashboard count both filter on it.
    index("members_status_idx").on(t.status),
  ],
);

// ---------------------------------------------------------------------------
// Cell groups — discipleship cells. A cell has a leader (a member) and may sit
// under a parent cell, forming the leader-of-leaders network.
// ---------------------------------------------------------------------------

export const cellGroups = pgTable(
  "cell_groups",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    // The member who leads this cell. Nullable so a cell can briefly be leaderless.
    leaderId: text("leader_id").references(() => members.id, {
      onDelete: "set null",
    }),
    // The upline cell. This nesting produces "leaders of leaders".
    parentCellGroupId: text("parent_cell_group_id").references(
      (): AnyPgColumn => cellGroups.id,
      { onDelete: "set null" },
    ),
    meetingDay: integer("meeting_day"), // 0 = Sunday .. 6 = Saturday
    meetingTime: text("meeting_time"), // "HH:mm" 24h
    meetingLocation: text("meeting_location"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Both sides of the leader-of-leaders graph, walked on every /cell-groups load.
    index("cell_groups_leader_id_idx").on(t.leaderId),
    index("cell_groups_parent_cell_group_id_idx").on(t.parentCellGroupId),
  ],
);

// ---------------------------------------------------------------------------
// Service schedules — recurring templates (e.g. "Sunday Service, weekly 9AM")
// that auto-generate dated service occurrences.
// ---------------------------------------------------------------------------

export const serviceSchedules = pgTable("service_schedules", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  type: text("type", {
    enum: ["sunday_service", "midweek_service", "special_event"],
  })
    .notNull()
    .default("sunday_service"),
  // Day of week, 0 = Sunday .. 6 = Saturday (matches JS Date.getDay()).
  dayOfWeek: integer("day_of_week").notNull(),
  // Time of day in 24h "HH:mm".
  timeOfDay: text("time_of_day").notNull(),
  location: text("location"),
  notes: text("notes"),
  // When false, no new occurrences are generated.
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Services / events — attendance is recorded against one of these. May be a
// one-off (scheduleId null) or an occurrence generated from a schedule.
// ---------------------------------------------------------------------------

export const services = pgTable(
  "services",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    type: text("type", {
      enum: ["sunday_service", "midweek_service", "special_event"],
    })
      .notNull()
      .default("sunday_service"),
    // Date + time the service is held.
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    location: text("location"),
    notes: text("notes"),
    // The recurring schedule this occurrence came from, if any.
    scheduleId: text("schedule_id").references(() => serviceSchedules.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Prevents generating the same occurrence twice for a schedule.
    unique("services_schedule_occurrence_unique").on(
      t.scheduleId,
      t.scheduledAt,
    ),
    // Every services query orders by this column, and /scan slices a window
    // around now out of it. The unique constraint above leads with schedule_id,
    // so it cannot serve those on its own.
    index("services_scheduled_at_idx").on(t.scheduledAt),
  ],
);

// ---------------------------------------------------------------------------
// Attendance — one row per member per service (deduped by unique constraint).
// ---------------------------------------------------------------------------

export const attendance = pgTable(
  "attendance",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    serviceId: text("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Which staff user scanned them in (nullable — user may be deleted later).
    recordedBy: text("recorded_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    unique("attendance_member_service_unique").on(t.memberId, t.serviceId),
    // The unique constraint leads with member_id, so it is no help to the
    // per-service aggregates — the attendance count next to every service on
    // /services, /dashboard and /services/[id] — which all group by this column.
    index("attendance_service_id_idx").on(t.serviceId),
    // The dashboard's "check-ins (7 days)" tile filters on this.
    index("attendance_checked_in_at_idx").on(t.checkedInAt),
    // Deleting a staff user nulls this column across the table.
    index("attendance_recorded_by_idx").on(t.recordedBy),
  ],
);

// ---------------------------------------------------------------------------
// App settings — a single-row table holding integration config (e.g. the
// Google Sheets webhook). Keyed by a constant id so there is only ever one row.
// ---------------------------------------------------------------------------

export const appSettings = pgTable("app_settings", {
  id: text("id").primaryKey().default("singleton"),
  sheetsWebhookUrl: text("sheets_webhook_url"),
  sheetsWebhookSecret: text("sheets_webhook_secret"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Audit log — an append-only record of who changed what. Written by
// recordAudit() in lib/audit.ts inside the mutation's own transaction, so a
// change that rolls back leaves no entry. Pruned after AUDIT_RETENTION_MONTHS
// by `bun run audit:prune`.
// ---------------------------------------------------------------------------

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    // The staff user who made the change. Kept when the entry outlives them,
    // just no longer attributable.
    actorId: text("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // e.g. "member.update" — AUDIT_ACTIONS in lib/constants.ts.
    action: text("action").notNull(),
    // e.g. "member" — AUDIT_ENTITIES in lib/constants.ts.
    entity: text("entity").notNull(),
    // Deliberately not a foreign key: the entry has to survive the record's
    // deletion, which is often the very thing it records.
    entityId: text("entity_id").notNull(),
    // Only the changed fields on an update; the whole row on a create or a
    // delete. Secrets are redacted before they get here.
    before: jsonb("before"),
    after: jsonb("after"),
    summary: text("summary").notNull(),
  },
  (t) => [
    // The member page's History tab reads one record's entries.
    index("audit_log_entity_idx").on(t.entity, t.entityId),
    // /settings/audit sorts newest-first, and pruning deletes by age.
    index("audit_log_at_idx").on(t.at),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
  rolePermissions: many(rolePermissions),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(
  rolePermissions,
  ({ one }) => ({
    role: one(roles, {
      fields: [rolePermissions.roleId],
      references: [roles.id],
    }),
    permission: one(permissions, {
      fields: [rolePermissions.permissionKey],
      references: [permissions.key],
    }),
  }),
);

export const usersRelations = relations(users, ({ one }) => ({
  role: one(roles, {
    fields: [users.roleId],
    references: [roles.id],
  }),
}));

export const membersRelations = relations(members, ({ one, many }) => ({
  attendance: many(attendance),
  cellGroup: one(cellGroups, {
    fields: [members.cellGroupId],
    references: [cellGroups.id],
  }),
  user: one(users, {
    fields: [members.userId],
    references: [users.id],
  }),
  ledCellGroups: many(cellGroups, { relationName: "cellLeader" }),
}));

export const cellGroupsRelations = relations(cellGroups, ({ one, many }) => ({
  leader: one(members, {
    fields: [cellGroups.leaderId],
    references: [members.id],
    relationName: "cellLeader",
  }),
  parent: one(cellGroups, {
    fields: [cellGroups.parentCellGroupId],
    references: [cellGroups.id],
    relationName: "cellParent",
  }),
  children: many(cellGroups, { relationName: "cellParent" }),
  members: many(members),
}));

export const serviceSchedulesRelations = relations(
  serviceSchedules,
  ({ many }) => ({
    services: many(services),
  }),
);

export const servicesRelations = relations(services, ({ one, many }) => ({
  attendance: many(attendance),
  schedule: one(serviceSchedules, {
    fields: [services.scheduleId],
    references: [serviceSchedules.id],
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actor: one(users, {
    fields: [auditLog.actorId],
    references: [users.id],
  }),
}));

export const attendanceRelations = relations(attendance, ({ one }) => ({
  member: one(members, {
    fields: [attendance.memberId],
    references: [members.id],
  }),
  service: one(services, {
    fields: [attendance.serviceId],
    references: [services.id],
  }),
  recordedByUser: one(users, {
    fields: [attendance.recordedBy],
    references: [users.id],
  }),
}));

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type Role = typeof roles.$inferSelect;
export type Permission = typeof permissions.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Service = typeof services.$inferSelect;
export type ServiceSchedule = typeof serviceSchedules.$inferSelect;
export type Attendance = typeof attendance.$inferSelect;
export type CellGroup = typeof cellGroups.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
