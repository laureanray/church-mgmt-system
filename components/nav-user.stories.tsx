import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { NavUser } from "./nav-user";
import { Sidebar, SidebarFooter, SidebarProvider } from "./ui/sidebar";

const meta = {
  title: "Navigation/NavUser",
  component: NavUser,
  decorators: [
    (Story) => (
      <SidebarProvider defaultOpen>
        <Sidebar>
          <SidebarFooter>
            <Story />
          </SidebarFooter>
        </Sidebar>
      </SidebarProvider>
    ),
  ],
  args: {
    user: {
      name: "Maria Santos",
      email: "maria@example.com",
      roleName: "Ministry Coordinator",
    },
  },
} satisfies Meta<typeof NavUser>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
