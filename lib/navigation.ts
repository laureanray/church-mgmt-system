import type { PermissionKey } from "./permissions";

/**
 * The app's module navigation. The sidebar renders it and homeFor() picks the
 * first entry a user can open, so the two can never disagree about what
 * someone has access to. Hiding an entry is usability, not authorization —
 * every destination checks for itself.
 */
export type NavItem = {
  title: string;
  href: string;
  permission: PermissionKey;
  /** Also shown to anyone on a ministry roster, whatever their permissions. */
  ministryMembers?: boolean;
};

export type NavSection = { label: string; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Menu",
    items: [
      { title: "Dashboard", href: "/dashboard", permission: "dashboard.view" },
      { title: "Scan Attendance", href: "/scan", permission: "attendance.view" },
      { title: "Members", href: "/members", permission: "members.view" },
      { title: "Celebrations", href: "/celebrations", permission: "members.view" },
      { title: "Cell Groups", href: "/cell-groups", permission: "cell_groups.view" },
      { title: "Services", href: "/services", permission: "services.view" },
      {
        title: "Ministries",
        href: "/ministries",
        permission: "ministries.view",
        ministryMembers: true,
      },
    ],
  },
  {
    label: "LAM",
    items: [
      { title: "Line-ups", href: "/lam", permission: "lam.view" },
      { title: "Song Library", href: "/lam/songs", permission: "lam.view" },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Staff Users", href: "/users", permission: "users.view" },
      { title: "Roles & Permissions", href: "/roles", permission: "roles.view" },
      { title: "Settings", href: "/settings", permission: "settings.view" },
    ],
  },
];

export type NavViewer = {
  permissions: readonly PermissionKey[];
  ministryCount: number;
};

export function canSeeNavItem(item: NavItem, viewer: NavViewer) {
  return (
    viewer.permissions.includes(item.permission) ||
    (item.ministryMembers === true && viewer.ministryCount > 0)
  );
}

/** Sections with at least one visible item, holding only those items. */
export function visibleNavSections(viewer: NavViewer): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => canSeeNavItem(item, viewer)),
  })).filter((section) => section.items.length > 0);
}

export function firstAccessibleHref(viewer: NavViewer): string | null {
  return visibleNavSections(viewer)[0]?.items[0]?.href ?? null;
}

/**
 * The single nav entry a path belongs to: the longest matching href, so
 * /lam/songs lights up "Song Library" and not "Line-ups" as well.
 */
export function activeNavHref(pathname: string, hrefs: readonly string[]) {
  return hrefs
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
}
