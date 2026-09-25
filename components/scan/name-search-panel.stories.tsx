import type { ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { toast } from "sonner";

import { Toaster } from "@/components/ui/sonner";
import type { CheckInCandidate } from "@/server/attendance";
import { NameSearchPanel } from "./name-search-panel";

const meta: Meta<typeof NameSearchPanel> = {
  title: "Scan/NameSearchPanel",
  component: NameSearchPanel,
};

export default meta;
type Story = StoryObj<typeof meta>;

const MEMBERS: CheckInCandidate[] = [
  { id: "ana", fullName: "Ana Santos", status: "active", cellGroupName: "Joshua Cell", birthYear: 1994 },
  { id: "ana-2", fullName: "Ana Santos", status: "active", cellGroupName: "Caleb Cell", birthYear: 2008 },
  { id: "dennis", fullName: "Dennis Santos", status: "inactive", cellGroupName: null, birthYear: 1979 },
  { id: "jose", fullName: "Jose Santiago", status: "active", cellGroupName: "Joshua Cell", birthYear: null },
  { id: "maria", fullName: "Maria Santos-Reyes", status: "visitor", cellGroupName: null, birthYear: 1988 },
  { id: "ruth", fullName: "Ruth Villanueva", status: "active", cellGroupName: "Caleb Cell", birthYear: 1991 },
];

/** Stands in for the server: a short delay, then the directory filtered by name. */
async function fakeSearch(query: string) {
  await new Promise((resolve) => setTimeout(resolve, 150));
  const text = query.trim().toLowerCase();
  return MEMBERS.filter((m) => m.fullName.toLowerCase().includes(text)).slice(0, 10);
}

async function fakeCheckIn(member: CheckInCandidate) {
  await new Promise((resolve) => setTimeout(resolve, 300));
  toast.success(`${member.fullName} checked in`);
  return true;
}

function Preview({
  defaultQuery,
  search = fakeSearch,
  onSelect = fakeCheckIn,
}: Partial<ComponentProps<typeof NameSearchPanel>>) {
  return (
    <div className="max-w-md p-6">
      <NameSearchPanel
        defaultQuery={defaultQuery}
        search={search}
        onSelect={onSelect}
      />
      <Toaster />
    </div>
  );
}

/** Waiting for a name. Nothing is searched until two letters are typed. */
export const Default: Story = {
  render: () => <Preview />,
};

/**
 * Two members share a name; the cell group and birth year tell them apart.
 * Arrow keys move the highlight, Enter checks the highlighted person in.
 */
export const Matches: Story = {
  render: () => <Preview defaultQuery="san" />,
};

/** Someone returning after a long absence is found and flagged, not hidden. */
export const ReturningMember: Story = {
  render: () => <Preview defaultQuery="dennis" />,
};

/** A search that missed suggests another query, never creating a member. */
export const NoMatches: Story = {
  render: () => <Preview defaultQuery="Zacarias" />,
};

export const Searching: Story = {
  render: () => (
    <Preview defaultQuery="san" search={() => new Promise(() => {})} />
  ),
};

export const SearchFailed: Story = {
  render: () => (
    <Preview
      defaultQuery="san"
      search={async () => {
        throw new Error("offline");
      }}
    />
  ),
};

/** The spinner holds while the check-in is recorded; the box then clears. */
export const CheckingIn: Story = {
  render: () => (
    <Preview
      defaultQuery="ruth"
      onSelect={async (member) => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        toast.success(`${member.fullName} checked in`);
        return true;
      }}
    />
  ),
};
