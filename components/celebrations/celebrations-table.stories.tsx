import * as React from "react";
import Link from "next/link";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import {
  celebrationWindow,
  collectCelebrations,
  type CelebrationSource,
} from "@/lib/celebrations";
import { tableContext } from "@/lib/data-table";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CelebrationsTable } from "./celebrations-table";

// A fixed "today" so the stories never drift: Wednesday 30 December 2026,
// whose week runs into the new year.
const TODAY = "2026-12-30";

const kabataan = { id: "c1", name: "Kabataan Cell" };
const couples = { id: "c2", name: "Couples for Christ" };

const SAMPLE_MEMBERS: CelebrationSource[] = [
  { id: "1", fullName: "Ana Reyes", status: "active", maritalStatus: "married", birthdate: "1988-12-30", spiritualBirthday: null, weddingAnniversary: "2012-01-02", cellGroup: couples },
  { id: "2", fullName: "Ben Cruz", status: "visitor", maritalStatus: "single", birthdate: "2004-01-01", spiritualBirthday: "2023-12-31", weddingAnniversary: null, cellGroup: kabataan },
  { id: "3", fullName: "Carla Dizon", status: "active", maritalStatus: "widowed", birthdate: "1952-01-04", spiritualBirthday: "1990-12-17", weddingAnniversary: "1975-12-06", cellGroup: null },
  { id: "4", fullName: "Dennis Santos", status: "inactive", maritalStatus: "married", birthdate: "1990-12-12", spiritualBirthday: "2015-12-24", weddingAnniversary: "2016-12-27", cellGroup: couples },
  // Unmarried, so this anniversary must never appear.
  { id: "5", fullName: "Elena Villanueva", status: "active", maritalStatus: "single", birthdate: "1996-12-03", spiritualBirthday: null, weddingAnniversary: "2019-12-31", cellGroup: kabataan },
  // Record-only statuses are never greeted.
  { id: "6", fullName: "Fidel Ramos", status: "deceased", maritalStatus: "married", birthdate: "1940-12-31", spiritualBirthday: null, weddingAnniversary: null, cellGroup: null },
];

const week = collectCelebrations(SAMPLE_MEMBERS, celebrationWindow("week", TODAY));
const month = collectCelebrations(SAMPLE_MEMBERS, celebrationWindow("month", TODAY));
const ctx = tableContext("/celebrations", { range: "week" });

const meta: Meta<typeof CelebrationsTable> = {
  title: "Celebrations/CelebrationsTable",
  component: CelebrationsTable,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The next seven days from a Wednesday 30 December: the list crosses into
 * January, and the rows falling today are marked.
 */
export const Week: Story = {
  render: () => (
    <CelebrationsTable
      ctx={ctx}
      rows={week}
      today={TODAY}
      caption="Celebrations in the next 7 days"
    />
  ),
};

/** The whole calendar month, including the days already past. */
export const Month: Story = {
  render: () => (
    <CelebrationsTable
      ctx={ctx}
      rows={month}
      today={TODAY}
      caption="Celebrations this month"
    />
  ),
};

export const Empty: Story = {
  render: () => (
    <CelebrationsTable
      ctx={ctx}
      rows={[]}
      today={TODAY}
      caption="Celebrations in the next 7 days"
      emptyTitle="No celebrations in the next 7 days"
      emptyDescription="Birthdays and anniversaries appear here once members have them on record."
    />
  ),
};

/** The dashboard card: at most five rows, no cell-group column, no frame. */
export const DashboardCard: Story = {
  render: () => (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="text-base">Celebrations this week</CardTitle>
        <CardAction>
          <Link
            href="/celebrations?range=week"
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            View all
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        <CelebrationsTable
          ctx={tableContext("/dashboard", {})}
          rows={week.slice(0, 5)}
          today={TODAY}
          caption="Celebrations in the next 7 days"
          compact
        />
      </CardContent>
    </Card>
  ),
};

export const DashboardCardEmpty: Story = {
  render: () => (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="text-base">Celebrations this week</CardTitle>
      </CardHeader>
      <CardContent>
        <CelebrationsTable
          ctx={tableContext("/dashboard", {})}
          rows={[]}
          today={TODAY}
          caption="Celebrations in the next 7 days"
          emptyTitle="Nothing to celebrate in the next 7 days"
          compact
        />
      </CardContent>
    </Card>
  ),
};
