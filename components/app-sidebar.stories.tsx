import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { AppSidebar } from "./app-sidebar";
import { SidebarProvider } from "./ui/sidebar";

/**
 * Module navigation, filtered by the signed-in user's effective permissions —
 * their role's plus their ministries'. Sections with nothing visible drop out.
 */
const meta = {
  title: "Navigation/AppSidebar",
  component: AppSidebar,
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/members" } } },
  decorators: [(Story) => <SidebarProvider defaultOpen><Story /></SidebarProvider>],
  args: {
    user: {
      name: "Maria Santos",
      email: "maria@example.com",
      roleName: "Leader",
      permissions: [
        "dashboard.view",
        "attendance.view",
        "members.view",
        "cell_groups.view",
        "services.view",
        "ministries.view",
        "lam.view",
      ],
      ministryCount: 0,
    },
  },
} satisfies Meta<typeof AppSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Leader: Story = {};
export const Administrator: Story = {
  args: {
    user: {
      name: "Church Admin",
      email: "admin@church.local",
      roleName: "Admin",
      permissions: [
        "dashboard.view",
        "attendance.view",
        "members.view",
        "cell_groups.view",
        "services.view",
        "ministries.view",
        "lam.view",
        "users.view",
        "roles.view",
        "settings.view",
      ],
      ministryCount: 0,
    },
  },
};

/**
 * A volunteer whose role grants only the dashboard; LAM and Services come from
 * the LAM ministry, and Ministries shows because they are on a roster.
 */
export const LamVolunteer: Story = {
  parameters: { nextjs: { navigation: { pathname: "/lam/songs" } } },
  args: {
    user: {
      name: "Joy Villanueva",
      email: "joy@example.com",
      roleName: "Volunteer",
      permissions: ["dashboard.view", "services.view", "lam.view"],
      ministryCount: 1,
    },
  },
};
