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
