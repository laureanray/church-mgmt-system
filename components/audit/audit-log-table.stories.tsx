import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { REDACTED } from "@/lib/audit-diff";
import { tableContext, type RawSearchParams } from "@/lib/data-table";
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from "@/lib/constants";
import { AUDIT_SORT_KEYS, AuditLogTable, type AuditRow } from "./audit-log-table";

const meta: Meta<typeof AuditLogTable> = {
  title: "Audit/AuditLogTable",
  component: AuditLogTable,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof meta>;

const ROWS: AuditRow[] = [
  {
    id: "1",
    at: new Date("2026-09-21T09:14:00+08:00"),
    actorName: "Pastor Jun",
    action: "member.update",
    entity: "member",
    summary: "Edited Ana Reyes: contact number",
    before: { contactNumber: "+63 917 555 0134" },
    after: { contactNumber: "+63 918 555 0177" },
  },
  {
    id: "2",
    at: new Date("2026-09-20T18:02:00+08:00"),
    actorName: "Grace Lim",
    action: "member.status_change",
    entity: "member",
    summary: "Marked Dennis Santos active at check-in (was inactive)",
    before: { status: "inactive" },
    after: { status: "active" },
  },
  {
    id: "3",
    at: new Date("2026-09-19T10:40:00+08:00"),
    actorName: "Pastor Jun",
    action: "settings.update",
    entity: "settings",
    summary: "Changed settings: sheets webhook secret",
    before: { sheetsWebhookSecret: REDACTED },
    after: { sheetsWebhookSecret: REDACTED },
  },
  {
    id: "4",
    at: new Date("2026-09-18T08:30:00+08:00"),
    actorName: null,
    action: "cell_group.delete",
    entity: "cell_group",
    summary: "Deleted cell group Youth Cell (3 members unassigned)",
    before: { name: "Youth Cell", active: true, memberIds: ["m1", "m2", "m3"] },
    after: null,
  },
  {
    id: "5",
    at: new Date("2026-09-17T15:05:00+08:00"),
    actorName: "Pastor Jun",
    action: "user.password_reset",
    entity: "user",
    summary: "Issued a temporary password to Grace Lim",
    before: null,
    after: null,
  },
];

/**
 * The context is built in `render`, not in `args`: args must stay
 * JSON-serializable, and a story renders the table the way a page would.
 */
function LogTable({
  params = {},
  rows = ROWS,
  total = rows.length,
  variant = "log",
}: {
  params?: RawSearchParams;
  rows?: AuditRow[];
  total?: number;
  variant?: "log" | "record";
}) {
  const ctx = tableContext(
    variant === "log" ? "/settings/audit" : "/members/1",
    params,
    {
      prefix: variant === "log" ? undefined : "log",
      sortKeys: [...AUDIT_SORT_KEYS],
      filterKeys: variant === "log" ? ["action", "entity"] : [],
      filterValues: { action: AUDIT_ACTIONS, entity: AUDIT_ENTITIES },
      defaultSort: "at",
      defaultDirection: "desc",
    },
  );
  return <AuditLogTable ctx={ctx} rows={rows} total={total} variant={variant} />;
}

/** `/settings/audit`: every entry, newest first, searchable and faceted. */
export const FullLog: Story = { render: () => <LogTable /> };

/** Narrowed by the Action facet, as `?action=member.update` does. */
export const Filtered: Story = {
  render: () => (
    <LogTable params={{ action: "member.update" }} rows={ROWS.slice(0, 1)} />
  ),
};

/** A search that matched nothing offers to clear it, never to create. */
export const NoMatches: Story = {
  render: () => <LogTable params={{ q: "baptism" }} rows={[]} total={0} />,
};

/** A fresh install: the log explains what will appear rather than looking broken. */
export const Empty: Story = {
  render: () => <LogTable rows={[]} total={0} />,
};

/** A member's History tab: no search, facets or column menu, and no Record column. */
export const RecordHistory: Story = {
  render: () => (
    <LogTable variant="record" rows={ROWS.slice(0, 2)} />
  ),
};

export const RecordHistoryEmpty: Story = {
  render: () => <LogTable variant="record" rows={[]} total={0} />,
};

/** Page two of sixty entries, with the pagination control. */
export const Paged: Story = {
  render: () => <LogTable params={{ per: "10", page: "2" }} total={60} />,
};

/** Narrow screens keep only when and the summary; the rest returns at `sm` and up. */
export const Narrow: Story = {
  render: () => (
    <div className="w-80">
      <LogTable />
    </div>
  ),
};
