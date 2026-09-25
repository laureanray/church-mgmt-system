import type { ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { CheckInResult, ScanResult } from "@/app/(app)/scan/actions";
import { Toaster } from "@/components/ui/sonner";
import type { CheckInCandidate } from "@/server/attendance";
import { ScannerPanel } from "./scanner-panel";

const meta: Meta<typeof ScannerPanel> = {
  title: "Scan/ScannerPanel",
  component: ScannerPanel,
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof meta>;

const SERVICES = [
  {
    id: "sunday",
    name: "Sunday Worship",
    scheduledAt: new Date("2026-09-27T09:00:00+08:00"),
    location: "Main Sanctuary",
  },
  {
    id: "midweek",
    name: "Midweek Prayer",
    scheduledAt: new Date("2026-09-30T19:00:00+08:00"),
    location: null,
  },
];

const MEMBERS: (CheckInCandidate & { qrToken: string })[] = [
  { id: "ana", qrToken: "ana-token", fullName: "Ana Santos", status: "active", cellGroupName: "Joshua Cell", birthYear: 1994 },
  { id: "dennis", qrToken: "dennis-token", fullName: "Dennis Santos", status: "inactive", cellGroupName: null, birthYear: 1979 },
  { id: "ruth", qrToken: "ruth-token", fullName: "Ruth Villanueva", status: "active", cellGroupName: "Caleb Cell", birthYear: 1991 },
];

/**
 * A stand-in for the check-in actions: remembers who is in per service, so a
 * second pick reports the duplicate with the first time, as the server does.
 */
function fakeActions(): Pick<
  ComponentProps<typeof ScannerPanel>,
  "recordScan" | "checkIn" | "searchMembers" | "reactivate"
> {
  const checkedIn = new Map<string, string>();

  async function checkIn(serviceId: string, memberId: string): Promise<CheckInResult> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const member = MEMBERS.find((m) => m.id === memberId);
    if (!member) return { status: "error", message: "That member no longer exists." };
    const key = `${serviceId}:${memberId}`;
    const earlier = checkedIn.get(key);
    if (!earlier) checkedIn.set(key, new Date().toISOString());
    return {
      status: earlier ? "duplicate" : "ok",
      memberId,
      memberName: member.fullName,
      memberStatus: member.status,
      at: earlier ?? checkedIn.get(key)!,
    };
  }

  return {
    checkIn,
    async recordScan(serviceId, scannedText): Promise<ScanResult> {
      const member = MEMBERS.find((m) => m.qrToken === scannedText.trim());
      if (!member) return { status: "not_found", token: scannedText.trim() };
      return checkIn(serviceId, member.id);
    },
    async searchMembers(query) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      const text = query.trim().toLowerCase();
      return MEMBERS.filter((m) => m.fullName.toLowerCase().includes(text));
    },
    async reactivate() {
      return { status: "ok" };
    },
  };
}

function Preview(props: Partial<ComponentProps<typeof ScannerPanel>>) {
  return (
    <div className="p-6">
      <ScannerPanel services={SERVICES} {...fakeActions()} {...props} />
      <Toaster />
    </div>
  );
}

/**
 * No service chosen yet, so the camera stays off; a name picked now is
 * refused until one is. Try "ana-token" in the manual entry once a service is set.
 */
export const NoServiceSelected: Story = {
  render: () => <Preview />,
};

/** The usual screen at the door. Selecting a service starts the camera. */
export const Scanning: Story = {
  render: () => <Preview initialServiceId="sunday" canReactivate />,
};

export const NoServices: Story = {
  render: () => <Preview services={[]} />,
};
