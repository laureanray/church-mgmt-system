import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { AppSidebar } from "./app-sidebar";
import { SidebarProvider } from "./ui/sidebar";

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
      ],
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
        "users.view",
        "roles.view",
        "settings.view",
      ],
    },
  },
};
