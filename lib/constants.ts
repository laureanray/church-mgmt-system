// Shared label maps and option lists for enums, used across forms and tables.

export const USER_ROLES = ["admin", "leader", "usher"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  leader: "Leader",
  usher: "Usher",
};

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

export const SERVICE_TYPES = [
  "worship_service",
  "prayer_meeting",
  "bible_study",
  "youth_service",
  "special_event",
  "other",
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  worship_service: "Worship Service",
  prayer_meeting: "Prayer Meeting",
  bible_study: "Bible Study",
  youth_service: "Youth Service",
  special_event: "Special Event",
  other: "Other",
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

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

// How many weeks of upcoming occurrences to keep generated per schedule.
export const OCCURRENCE_WEEKS_AHEAD = 8;
