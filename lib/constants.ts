// Shared label maps and option lists for enums, used across forms and tables.

export const GENDERS = ["male", "female"] as const;
export type Gender = (typeof GENDERS)[number];

export const GENDER_LABELS: Record<Gender, string> = {
  male: "Male",
  female: "Female",
};

export const MARITAL_STATUSES = [
  "single",
  "married",
  "widowed",
  "separated",
  "divorced",
] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

export const MARITAL_STATUS_LABELS: Record<MaritalStatus, string> = {
  single: "Single",
  married: "Married",
  widowed: "Widowed",
  separated: "Separated",
  divorced: "Divorced",
};

/**
 * Where a member stands with the church. `active` and `visitor` are people who
 * attend; `inactive` have stopped but may return; `transferred` and `deceased`
 * are kept for the record only.
 */
export const MEMBER_STATUSES = [
  "active",
  "visitor",
  "inactive",
  "transferred",
  "deceased",
] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  active: "Active",
  visitor: "Visitor",
  inactive: "Inactive",
  transferred: "Transferred",
  deceased: "Deceased",
};

/** What the members directory shows when the URL names no status. */
export const DEFAULT_DIRECTORY_STATUSES: MemberStatus[] = ["active", "visitor"];

/**
 * Statuses that still belong in celebrations and absentee reports. Someone who
 * has transferred or passed on should never be greeted or chased up.
 */
export const PASTORAL_STATUSES: MemberStatus[] = [
  "active",
  "visitor",
  "inactive",
];

/**
 * Checking in someone with one of these statuses means they are back, so the
 * check-in offers to mark them active again. A visitor attending is expected.
 */
export const LAPSED_STATUSES: MemberStatus[] = [
  "inactive",
  "transferred",
  "deceased",
];

export function isLapsed(status: MemberStatus): boolean {
  return LAPSED_STATUSES.includes(status);
}

export const SERVICE_TYPES = [
  "sunday_service",
  "midweek_service",
  "special_event",
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  sunday_service: "Sunday Service",
  midweek_service: "Midweek Service",
  special_event: "Special Event",
};

// Marital statuses for which a spouse / anniversary is relevant.
export const SPOUSE_RELEVANT_STATUSES: MaritalStatus[] = [
  "married",
  "widowed",
  "separated",
];

// Days of the week — index matches JS Date.getDay() (0 = Sunday).
export const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

// Options for a meeting-day <Select> (value is the JS day index as a string).
export const MEETING_DAY_OPTIONS = DAYS_OF_WEEK.map((label, i) => ({
  value: String(i),
  label,
}));

// How many weeks of upcoming occurrences to keep generated per schedule.
export const OCCURRENCE_WEEKS_AHEAD = 8;

/**
 * What the audit log records. The value is stored in `audit_log.action`, so
 * treat these like permission keys: add freely, never rename.
 */
export const AUDIT_ACTIONS = [
  "member.create",
  "member.update",
  "member.status_change",
  "member.delete",
  "member.cell_group_change",
  "cell_group.create",
  "cell_group.update",
  "cell_group.delete",
  "service.delete",
  "user.create",
  "user.update",
  "user.role_change",
  "user.password_reset",
  "user.delete",
  "role.create",
  "role.update",
  "role.delete",
  "settings.update",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  "member.create": "Member created",
  "member.update": "Member edited",
  "member.status_change": "Member status changed",
  "member.delete": "Member deleted",
  "member.cell_group_change": "Cell group membership changed",
  "cell_group.create": "Cell group created",
  "cell_group.update": "Cell group edited",
  "cell_group.delete": "Cell group deleted",
  "service.delete": "Service deleted",
  "user.create": "Staff user created",
  "user.update": "Staff user edited",
  "user.role_change": "Staff role changed",
  "user.password_reset": "Password reset",
  "user.delete": "Staff user deleted",
  "role.create": "Role created",
  "role.update": "Role edited",
  "role.delete": "Role deleted",
  "settings.update": "Settings changed",
};

/** The kind of record an audit entry is about — `audit_log.entity`. */
export const AUDIT_ENTITIES = [
  "member",
  "cell_group",
  "service",
  "user",
  "role",
  "settings",
] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

export const AUDIT_ENTITY_LABELS: Record<AuditEntity, string> = {
  member: "Member",
  cell_group: "Cell group",
  service: "Service",
  user: "Staff user",
  role: "Role",
  settings: "Settings",
};

// How long audit entries are kept before `bun run audit:prune` removes them.
export const AUDIT_RETENTION_MONTHS = 24;
