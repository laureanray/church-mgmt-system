import { desc } from "drizzle-orm";

import { db } from "@/db";
import { services } from "@/db/schema";
import { requireUser } from "@/lib/auth-helpers";
import { topUpAllSchedules } from "@/lib/occurrences";
import { PageHeader } from "@/components/patterns/page-header";
import { ScannerPanel } from "@/components/scan/scanner-panel";

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  await requireUser();
  const { service: serviceParam } = await searchParams;

  // Make sure recurring occurrences (incl. today's) exist before scanning.
  try {
    await topUpAllSchedules();
  } catch {
    // non-fatal
  }

  const rows = await db
    .select({
      id: services.id,
      name: services.name,
      scheduledAt: services.scheduledAt,
      location: services.location,
    })
    .from(services)
    .orderBy(desc(services.scheduledAt));

  // Default to the requested service, else the one scheduled closest to now.
  let initialServiceId = serviceParam;
  if (!initialServiceId && rows.length > 0) {
    // This async Server Component reads the clock after request-bound authentication.
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    initialServiceId = rows.reduce((best, s) =>
      Math.abs(s.scheduledAt.getTime() - now) <
      Math.abs(best.scheduledAt.getTime() - now)
        ? s
        : best,
    ).id;
  }

  return (
    <>
      <PageHeader
        title="Scan Attendance"
        description="Point the camera at a member's QR code to record their attendance."
      />
      <ScannerPanel services={rows} initialServiceId={initialServiceId} />
    </>
  );
}
