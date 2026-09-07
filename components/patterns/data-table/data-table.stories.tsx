import * as React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Users } from "lucide-react";

import { tableContext, type RawSearchParams } from "@/lib/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "./data-table";
import type { DataTableColumn } from "./types";

const meta: Meta<typeof DataTable> = {
  title: "Patterns/DataTable",
  component: DataTable,
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof meta>;

type Member = {
  id: string;
  fullName: string;
  gender: "male" | "female";
  status: "single" | "married" | "widowed";
  since: number;
  contact: string | null;
};

const MEMBERS: Member[] = [
  { id: "1", fullName: "Ana Reyes", gender: "female", status: "married", since: 2014, contact: "+63 917 555 0134" },
  { id: "2", fullName: "Ben Cruz", gender: "male", status: "single", since: 2019, contact: "+63 918 555 0177" },
  { id: "3", fullName: "Carla Dizon", gender: "female", status: "widowed", since: 2008, contact: null },
  { id: "4", fullName: "Dennis Santos", gender: "male", status: "married", since: 2021, contact: "+63 927 555 0102" },
  { id: "5", fullName: "Elena Villanueva", gender: "female", status: "single", since: 2016, contact: "+63 906 555 0155" },
];

const STATUS_LABELS = {
  single: "Single",
  married: "Married",
  widowed: "Widowed",
} as const;

const COLUMNS: DataTableColumn<Member>[] = [
  {
    id: "name",
    header: "Name",
    sortKey: "name",
    hideable: false,
    cellClassName: "font-medium",
    cell: (m) => m.fullName,
  },
  {
    id: "gender",
    header: "Gender",
    sortKey: "gender",
    hideBelow: "sm",
    cell: (m) => (m.gender === "male" ? "Male" : "Female"),
  },
  {
    id: "status",
    header: "Marital Status",
    label: "Marital status",
    sortKey: "status",
    hideBelow: "md",
    cell: (m) => <Badge variant="secondary">{STATUS_LABELS[m.status]}</Badge>,
  },
  {
    id: "since",
    header: "Member Since",
    label: "Member since",
    sortKey: "since",
    hideBelow: "lg",
    numeric: true,
    cell: (m) => m.since,
  },
  {
    id: "contact",
    header: "Contact",
    hideBelow: "sm",
    cellClassName: "text-muted-foreground",
    cell: (m) => m.contact ?? "—",
  },
];

const FACETS = [
  {
    id: "gender",
    label: "Gender",
    options: [
      { value: "male", label: "Male" },
      { value: "female", label: "Female" },
    ],
  },
];

/**
 * Stories build the context in `render` rather than in `args`: it carries the
 * route's `searchParams`, and args have to stay JSON-serializable.
 */
function ctxFor(params: RawSearchParams = {}) {
  return tableContext("/members", params, {
    sortKeys: ["name", "gender", "status", "since"],
    filterKeys: ["gender"],
    defaultSort: "name",
  });
}

function MembersTable({
  params = {},
  rows = MEMBERS,
  total = 248,
  ...rest
}: {
  params?: RawSearchParams;
  rows?: Member[];
  total?: number;
} & Partial<React.ComponentProps<typeof DataTable<Member>>>) {
  return (
    <div className="p-6">
      <DataTable
        ctx={ctxFor(params)}
        caption="Church members"
        columns={COLUMNS}
        rows={rows}
        rowKey={(m) => m.id}
        total={total}
        search={{
          placeholder: "Search by name…",
          label: "Search members by name",
        }}
        facets={FACETS}
        empty={{
          icon: Users,
          title: "No members yet",
          description:
            "Add your first member to generate their attendance QR code.",
          action: <Button size="sm">Add member</Button>,
        }}
        emptyFiltered={{ icon: Users, title: "No members match your search" }}
        {...rest}
      />
    </div>
  );
}

/**
 * Everything on at once: search, a facet, sortable headers, column visibility
 * and pagination. Each control is a link or a GET form, so the whole thing
 * works before any JavaScript loads — except the two menus, which need it to
 * open at all.
 */
export const Default: Story = {
  render: () => <MembersTable />,
};

/**
 * Sorting is spelled out in the URL, and the header reflects it in two ways:
 * an arrow for anyone who can see it, and `aria-sort` for anyone who cannot.
 */
export const Sorted: Story = {
  render: () => <MembersTable params={{ sort: "since", dir: "desc" }} />,
};

/**
 * An active facet shows its count on the trigger and puts a Reset beside it,
 * so a reader who has narrowed the list can always tell that they have.
 */
export const Filtered: Story = {
  render: () => (
    <MembersTable
      params={{ gender: "female", q: "re" }}
      rows={MEMBERS.filter((m) => m.gender === "female")}
      total={3}
    />
  ),
};

/**
 * A search that matched nothing. It must **not** offer the create action the
 * empty collection does: someone whose search missed is one click away from
 * making a duplicate of the record they were looking for.
 */
export const NoMatches: Story = {
  render: () => (
    <MembersTable params={{ q: "zzz", gender: "male" }} rows={[]} total={0} />
  ),
};

/** The collection itself is empty, which is the one case that invites a create. */
export const Empty: Story = {
  render: () => <MembersTable rows={[]} total={0} />,
};

/** Two columns switched off from the Columns menu, recorded in `?hide=`. */
export const HiddenColumns: Story = {
  render: () => <MembersTable params={{ hide: "gender,since" }} />,
};

/** The last page, where Next and Last are disabled rather than dimmed links. */
export const LastPage: Story = {
  render: () => <MembersTable params={{ page: "13" }} />,
};

/**
 * Inside a Card, with no state of its own — the dashboard's five-row summary.
 * `framed` drops the border the Card already draws, and with no `total` there
 * is no pagination.
 */
export const InsideCard: Story = {
  render: () => (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Members</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            ctx={tableContext("/dashboard", {})}
            caption="Recently added members"
            columns={COLUMNS}
            rows={MEMBERS.slice(0, 3)}
            rowKey={(m) => m.id}
            framed={false}
            columnVisibility={false}
            empty={{ title: "No members yet" }}
          />
        </CardContent>
      </Card>
    </div>
  ),
};

/** `density="compact"` tightens the rows where a long list is the point. */
export const Compact: Story = {
  render: () => <MembersTable density="compact" />,
};
