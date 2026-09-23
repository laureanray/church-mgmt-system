import { asc, desc, eq, gte, lt } from "drizzle-orm";

import { db } from "@/db";
import { services } from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth-helpers";
import { topUpAllSchedules } from "@/lib/occurrences";
import { selectScanServices } from "@/lib/scan-selection";
import { PageHeader } from "@/components/patterns/page-header";
import { ScannerPanel } from "@/components/scan/scanner-panel";

/** How many services either side of now the picker offers. */
const SCAN_WINDOW = 25;

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const user = await requirePermission("attendance.view");
  const { service: serviceParam } = await searchParams;

  // Make sure recurring occurrences (incl. today's) exist before scanning.
  try {
    await topUpAllSchedules();
  } catch {
    // non-fatal
  }

  const now = new Date();

  const columns = {
    id: services.id,
    name: services.name,
    scheduledAt: services.scheduledAt,
    location: services.location,
  };

  // The nearest occurrences on either side of now, rather than every service
  // ever held. Ushers only ever scan into something close to today, and this
  // list is a dropdown — left unbounded it grows by one row per service per
  // week, forever.
  //
  // A ?service= deep link can name something outside that window, though: every
  // service detail page links here, however old. So it is fetched alongside and
  // folded into the list, which also means a link naming a service that no
  // longer exists resolves to nothing and falls back, rather than selecting an
  // id the picker cannot show.
  const [upcoming, past, requested] = await Promise.all([
    db
      .select(columns)
      .from(services)
      .where(gte(services.scheduledAt, now))
      .orderBy(asc(services.scheduledAt))
      .limit(SCAN_WINDOW),
    db
      .select(columns)
      .from(services)
      .where(lt(services.scheduledAt, now))
      .orderBy(desc(services.scheduledAt))
      .limit(SCAN_WINDOW),
    serviceParam
      ? db.select(columns).from(services).where(eq(services.id, serviceParam))
      : [],
  ]);

  const { rows, initialServiceId } = selectScanServices(
    [...upcoming, ...past],
    requested.at(0),
    now.getTime(),
  );

  return (
    <>
      <PageHeader
        title="Scan Attendance"
        description="Point the camera at a member's QR code to record their attendance."
      />
      <ScannerPanel
        services={rows}
        initialServiceId={initialServiceId}
        canReactivate={hasPermission(user, "members.update")}
      />
    </>
  );
}
