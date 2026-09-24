"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Church,
  LayoutDashboard,
  QrCode,
  Users,
  CalendarDays,
  Network,
  Settings,
  UserCog,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { NavUser } from "@/components/nav-user";
import { IntentLink } from "@/components/patterns/intent-link";
import type { PermissionKey } from "@/lib/permissions";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  permission: PermissionKey;
};

const NAV_ITEMS: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { title: "Scan Attendance", href: "/scan", icon: QrCode, permission: "attendance.view" },
  { title: "Members", href: "/members", icon: Users, permission: "members.view" },
  { title: "Cell Groups", href: "/cell-groups", icon: Network, permission: "cell_groups.view" },
  { title: "Services", href: "/services", icon: CalendarDays, permission: "services.view" },
  {
    title: "Staff Users",
    href: "/users",
    icon: UserCog,
    permission: "users.view",
  },
  {
    title: "Roles & Permissions",
    href: "/roles",
    icon: ShieldCheck,
    permission: "roles.view",
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
    permission: "settings.view",
  },
];

export function AppSidebar({
  user,
}: {
  user: {
    name: string;
    email: string;
    roleName: string;
    permissions: PermissionKey[];
  };
}) {
  const pathname = usePathname();

  const items = NAV_ITEMS.filter((item) =>
    user.permissions.includes(item.permission),
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/dashboard" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Church className="size-5" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">IRM Ministries</span>
                <span className="truncate text-xs text-muted-foreground">
                  Church Management
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarMenu>
            {items.map((item) => {
              const active =
                pathname === item.href ||
                pathname.startsWith(item.href + "/");
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<IntentLink href={item.href} />}
                    isActive={active}
                    tooltip={item.title}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
