"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Cake,
  Church,
  LayoutDashboard,
  QrCode,
  Users,
  CalendarDays,
  Network,
  Settings,
  UserCog,
  ShieldCheck,
  HandHeart,
  Music,
  ListMusic,
  type LucideIcon,
} from "lucide-react";

import { NavUser } from "@/components/nav-user";
import { IntentLink } from "@/components/patterns/intent-link";
import { activeNavHref, visibleNavSections } from "@/lib/navigation";
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

// Icons stay here rather than in lib/navigation.ts, which is shared with the
// server and has no business importing components.
const NAV_ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/scan": QrCode,
  "/members": Users,
  "/celebrations": Cake,
  "/cell-groups": Network,
  "/services": CalendarDays,
  "/ministries": HandHeart,
  "/lam": Music,
  "/lam/songs": ListMusic,
  "/users": UserCog,
  "/roles": ShieldCheck,
  "/settings": Settings,
};

export function AppSidebar({
  user,
}: {
  user: {
    name: string;
    email: string;
    roleName: string;
    permissions: PermissionKey[];
    /** How many active ministries the user serves in. */
    ministryCount: number;
  };
}) {
  const pathname = usePathname();

  const sections = visibleNavSections(user);
  const active = activeNavHref(
    pathname,
    sections.flatMap((section) => section.items.map((item) => item.href)),
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
        {sections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarMenu>
              {section.items.map((item) => {
                const Icon = NAV_ICONS[item.href] ?? LayoutDashboard;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={<IntentLink href={item.href} />}
                      isActive={item.href === active}
                      tooltip={item.title}
                    >
                      <Icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
