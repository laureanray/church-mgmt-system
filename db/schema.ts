import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRoleEnum = pgEnum("user_role", ["admin", "leader", "usher"]);

export const genderEnum = pgEnum("gender", ["male", "female"]);

export const maritalStatusEnum = pgEnum("marital_status", [
  "single",
  "married",
  "widowed",
  "separated",
  "divorced",
]);

export const serviceTypeEnum = pgEnum("service_type", [
  "worship_service",
  "prayer_meeting",
  "bible_study",
  "youth_service",
  "special_event",
  "other",
]);

// ---------------------------------------------------------------------------
// Users — staff who log in (admin / leader / usher)
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("usher"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Members — the church congregation. Each has a unique QR token.
// ---------------------------------------------------------------------------

export const members = pgTable("members", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Unique token encoded into the member's QR code.
  qrToken: text("qr_token").notNull().unique(),

  fullName: text("full_name").notNull(),
  birthdate: date("birthdate"),
  spiritualBirthday: date("spiritual_birthday"),
  // "Taon na naging Kaanib ng IRM" — year the member joined IRM.
  memberSinceYear: integer("member_since_year"),
  gender: genderEnum("gender"),
  maritalStatus: maritalStatusEnum("marital_status"),
  spouseName: text("spouse_name"),
  weddingAnniversary: date("wedding_anniversary"),
  contactNumber: text("contact_number"),
  homeAddress: text("home_address"),
  motherName: text("mother_name"),
  fatherName: text("father_name"),
  educationalLevel: text("educational_level"),
  occupation: text("occupation"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Service schedules — recurring templates (e.g. "Sunday Service, weekly 9AM")
// that auto-generate dated service occurrences.
// ---------------------------------------------------------------------------

export const serviceSchedules = pgTable("service_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: serviceTypeEnum("type").notNull().default("worship_service"),
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
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    type: serviceTypeEnum("type").notNull().default("worship_service"),
    // Date + time the service is held.
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    location: text("location"),
    notes: text("notes"),
    // The recurring schedule this occurrence came from, if any.
    scheduleId: uuid("schedule_id").references(() => serviceSchedules.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // Prevents generating the same occurrence twice for a schedule.
  (t) => [
    unique("services_schedule_occurrence_unique").on(
      t.scheduleId,
      t.scheduledAt,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Attendance — one row per member per service (deduped by unique constraint).
// ---------------------------------------------------------------------------

export const attendance = pgTable(
  "attendance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Which staff user scanned them in (nullable — user may be deleted later).
    recordedBy: uuid("recorded_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [unique("attendance_member_service_unique").on(t.memberId, t.serviceId)],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const membersRelations = relations(members, ({ many }) => ({
  attendance: many(attendance),
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
export type NewUser = typeof users.$inferInsert;
export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;
export type ServiceSchedule = typeof serviceSchedules.$inferSelect;
export type NewServiceSchedule = typeof serviceSchedules.$inferInsert;
export type Attendance = typeof attendance.$inferSelect;
export type NewAttendance = typeof attendance.$inferInsert;
