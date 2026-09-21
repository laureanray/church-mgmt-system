import { z } from "zod";

import {
  GENDERS,
  MARITAL_STATUSES,
  SERVICE_TYPES,
  USER_ROLES,
} from "./constants";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Trim strings and turn empty ones into null. */
const emptyToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v;

const optionalText = z.preprocess(
  emptyToNull,
  z.string().trim().max(500).nullable(),
);

const optionalDate = z.preprocess(
  emptyToNull,
  z
    .string()
    .regex(DATE_RE, "Use a valid date")
    .nullable(),
);

const CURRENT_YEAR = new Date().getFullYear();

// IDs come from a hidden <input>/<select>; the DB foreign key enforces validity,
// so we only require a non-empty string — works for UUID or nanoid ids alike.
const optionalId = z.preprocess(emptyToNull, z.string().min(1).nullable());

export const memberSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(200),
  middleName: z.preprocess(emptyToNull, z.string().trim().max(200).nullish()).transform((v) => v ?? null),
  lastName: z.string().trim().min(1, "Last name is required").max(200),
  birthdate: optionalDate,
  spiritualBirthday: optionalDate,
  memberSinceYear: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z
      .number()
      .int()
      .min(1900, "Year seems too early")
      .max(CURRENT_YEAR + 1, "Year can't be in the future")
      .nullable(),
  ),
  gender: z.preprocess(emptyToNull, z.enum(GENDERS).nullable()),
  maritalStatus: z.preprocess(emptyToNull, z.enum(MARITAL_STATUSES).nullable()),
  spouseName: optionalText,
  weddingAnniversary: optionalDate,
  contactNumber: optionalText,
  homeAddress: optionalText,
  motherName: optionalText,
  fatherName: optionalText,
  educationalLevel: optionalText,
  occupation: optionalText,
  cellGroupId: optionalId,
}).transform((member) => ({
  ...member,
  fullName: [member.firstName, member.middleName, member.lastName].filter(Boolean).join(" "),
}));

export const serviceSchema = z.object({
  name: z.string().trim().min(1, "Service name is required").max(200),
  type: z.enum(SERVICE_TYPES),
  // datetime-local value, e.g. "2026-07-05T09:00"
  scheduledAt: z
    .string()
    .min(1, "Date and time are required")
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Pick a valid date and time"),
  location: optionalText,
  notes: optionalText,
});

export const scheduleSchema = z.object({
  name: z.string().trim().min(1, "Schedule name is required").max(200),
  type: z.enum(SERVICE_TYPES),
  dayOfWeek: z.preprocess(
    (v) => (v === "" || v == null ? v : Number(v)),
    z.number().int().min(0).max(6),
  ),
  // 24h "HH:mm" from an <input type="time">
  timeOfDay: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Pick a valid time"),
  location: optionalText,
  notes: optionalText,
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Email is the login identity in Supabase Auth, so it is required and unique.
const emailField = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
  z.string().regex(EMAIL_RE, "Enter a valid email"),
);

// Admin creates a user (password is generated, not entered).
export const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: emailField,
  role: z.enum(USER_ROLES),
});

// Editing an existing user (same fields; password handled separately).
export const editUserSchema = createUserSchema;

// A user setting their own new password.
export const changePasswordSchema = z
  .object({
    // Must match minimum_password_length in supabase/config.toml — Supabase
    // rejects anything shorter, and the form should catch it first.
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const cellGroupSchema = z.object({
  name: z.string().trim().min(1, "Cell group name is required").max(200),
  leaderId: optionalId.optional().default(null),
  parentCellGroupId: optionalId.optional().default(null),
  meetingDay: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number().int().min(0).max(6).nullable(),
  ).optional().default(null),
  meetingTime: z.preprocess(
    emptyToNull,
    z.string().regex(/^\d{2}:\d{2}$/, "Pick a valid time").nullable(),
  ).optional().default(null),
  meetingLocation: optionalText.optional().default(null),
  notes: optionalText.optional().default(null),
  active: z.preprocess(
    (v) =>
      v === undefined || v === null
        ? true
        : v === "on" || v === "true" || v === true,
    z.boolean(),
  ).optional().default(true),
});

// Quick-assign a member to a cell group (or clear it with an empty value).
export const assignSchema = z.object({
  memberId: z.string().min(1, "Invalid member"),
  cellGroupId: optionalId,
});

// Promote a member to leader by creating a new cell group for them.
export const promoteSchema = z.object({
  memberId: z.string().min(1, "Invalid member"),
  name: z.string().trim().min(1, "Cell group name is required").max(200),
  parentCellGroupId: optionalId,
});

/** Flatten a ZodError into a { field: message } map for form display. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
