/**
 * The authorization catalog for the application.
 *
 * A new feature registers its module and permissions here, adds the matching
 * rows in a migration, then protects pages and actions with requirePermission.
 * Permission keys are persisted, so they must never be renamed casually.
 */
export const APP_MODULES = [
  {
    key: "dashboard",
    label: "Dashboard",
    description: "Church-wide summaries and recent activity.",
  },
  {
    key: "attendance",
    label: "Attendance",
    description: "Service check-in and attendance recording.",
  },
  {
    key: "members",
    label: "Members",
    description: "Member directory and personal records.",
  },
  {
    key: "cell_groups",
    label: "Cell Groups",
    description: "Cell-group structure, leaders, and assignments.",
  },
  {
    key: "services",
    label: "Services",
    description: "Services, schedules, and attendance summaries.",
  },
  {
    key: "users",
    label: "Staff Users",
    description: "Staff accounts and credentials.",
  },
  {
    key: "roles",
    label: "Roles & Permissions",
    description: "Roles and their access to application modules.",
  },
  {
    key: "settings",
    label: "Settings",
    description: "Application and integration settings.",
  },
  {
    key: "audit",
    label: "Audit Log",
    description: "The record of who changed members, staff, and settings.",
  },
] as const;

export type AppModuleKey = (typeof APP_MODULES)[number]["key"];

export const PERMISSIONS = [
  permission("dashboard.view", "dashboard", "View dashboard", "Open the dashboard and see its summaries."),
  permission("attendance.view", "attendance", "View check-in", "Open the attendance check-in module."),
  permission("attendance.record", "attendance", "Record attendance", "Check a member into a service."),
  permission("members.view", "members", "View members", "Browse and open member records."),
  permission("members.create", "members", "Create members", "Add member records."),
  permission("members.update", "members", "Edit members", "Change member records."),
  permission("members.delete", "members", "Delete members", "Permanently remove member records."),
  permission("cell_groups.view", "cell_groups", "View cell groups", "Browse the cell-group network."),
  permission("cell_groups.create", "cell_groups", "Create cell groups", "Add cell groups."),
  permission("cell_groups.update", "cell_groups", "Edit cell groups", "Change groups and member assignments."),
  permission("cell_groups.delete", "cell_groups", "Delete cell groups", "Permanently remove cell groups."),
  permission("services.view", "services", "View services", "Browse services, schedules, and attendance."),
  permission("services.create", "services", "Create services", "Add services and recurring schedules."),
  permission("services.update", "services", "Edit services", "Change services and recurring schedules."),
  permission("services.delete", "services", "Delete services", "Permanently remove services and schedules."),
  permission("services.sync", "services", "Sync attendance", "Send attendance records to the configured integration."),
  permission("users.view", "users", "View staff users", "Browse staff accounts."),
  permission("users.create", "users", "Create staff users", "Create staff login accounts."),
  permission("users.update", "users", "Edit staff users", "Change staff profiles and assigned roles."),
  permission("users.reset_password", "users", "Reset passwords", "Issue temporary passwords to staff."),
  permission("users.delete", "users", "Delete staff users", "Permanently remove staff accounts."),
  permission("roles.view", "roles", "View roles", "Browse roles and their permissions."),
  permission("roles.create", "roles", "Create roles", "Add custom staff roles."),
  permission("roles.update", "roles", "Edit roles", "Change role details and permissions."),
  permission("roles.delete", "roles", "Delete roles", "Delete unused custom roles."),
  permission("settings.view", "settings", "View settings", "Open application settings."),
  permission("settings.update", "settings", "Update settings", "Change application and integration settings."),
  permission("audit.view", "audit", "View audit log", "Read the audit log and each member's change history."),
] as const;

function permission<
  const Key extends string,
  const Module extends AppModuleKey,
>(key: Key, module: Module, label: string, description: string) {
  return { key, module, label, description } as const;
}

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const PERMISSION_KEYS = PERMISSIONS.map((item) => item.key) as [
  PermissionKey,
  ...PermissionKey[],
];

const permissionKeySet = new Set<string>(PERMISSION_KEYS);

export function isPermissionKey(value: string): value is PermissionKey {
  return permissionKeySet.has(value);
}

export const DEFAULT_ROLE_PERMISSIONS: Record<
  "admin" | "leader" | "usher",
  readonly PermissionKey[]
> = {
  admin: PERMISSION_KEYS,
  leader: [
    "dashboard.view",
    "attendance.view",
    "attendance.record",
    "members.view",
    "members.create",
    "members.update",
    "members.delete",
    "cell_groups.view",
    "cell_groups.create",
    "cell_groups.update",
    "cell_groups.delete",
    "services.view",
    "services.create",
    "services.update",
    "services.delete",
    "services.sync",
  ],
  usher: [
    "dashboard.view",
    "attendance.view",
    "attendance.record",
    "members.view",
    "cell_groups.view",
    "services.view",
  ],
};

export function groupPermissionsByModule(
  permissions: readonly (typeof PERMISSIONS)[number][] = PERMISSIONS,
) {
  return APP_MODULES.map((module) => ({
    ...module,
    permissions: permissions.filter((item) => item.module === module.key),
  }));
}
