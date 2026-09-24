import { requirePermission } from "@/lib/auth-helpers";
import {
  CELEBRATION_RANGE_LABELS,
  celebrationWindow,
  parseCelebrationRange,
} from "@/lib/celebrations";
import { celebrationsIn } from "@/lib/celebrations-query";
import { tableContext, type RawSearchParams } from "@/lib/data-table";
import { todayIn } from "@/lib/dates";
import { PageHeader } from "@/components/patterns/page-header";
import { CelebrationRangeTabs } from "@/components/celebrations/celebration-range-tabs";
import { CelebrationsTable } from "@/components/celebrations/celebrations-table";

export default async function CelebrationsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requirePermission("members.view");
  const params = await searchParams;
  const range = parseCelebrationRange(params.range);
  const today = todayIn();
  const rows = await celebrationsIn(celebrationWindow(range, today));

  // The list is bounded by its range and shown whole, so the table reads no
  // state of its own; the context only carries `?range=` through.
  const ctx = tableContext("/celebrations", params);
  const label = CELEBRATION_RANGE_LABELS[range].toLowerCase();

  return (
    <>
      <PageHeader
        title="Celebrations"
        description="Birthdays, spiritual birthdays and wedding anniversaries."
      />
      <CelebrationRangeTabs range={range}>
        <CelebrationsTable
          ctx={ctx}
          rows={rows}
          today={today}
          caption={`Celebrations ${label}`}
          emptyTitle={`No celebrations ${label}`}
          emptyDescription="Birthdays and anniversaries appear here once members have them on record."
        />
      </CelebrationRangeTabs>
    </>
  );
}
