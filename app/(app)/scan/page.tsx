import { asc, desc, gte, lt } from "drizzle-orm";

import { db } from "@/db";
import { services } from "@/db/schema";
import { requireUser } from "@/lib/auth-helpers";
import { topUpAllSchedules } from "@/lib/occurrences";
import { PageHeader } from "@/components/page-header";
import { ScannerPanel } from "@/components/scan/scanner-panel";

/** How many services either side of now the picker offers. */
const SCAN_WINDOW = 25;

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
  // week, forever. Taking a window from both sides keeps the default below
  // exactly as accurate as reading the whole table would.
  const [upcoming, past] = await Promise.all([
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
  ]);

  // Newest first, matching what the panel used to be given.
  const rows = [...upcoming.reverse(), ...past];

  // Default to the requested service, else the one scheduled closest to now.
  let initialServiceId = serviceParam;
  if (!initialServiceId && rows.length > 0) {
    const nowMs = now.getTime();
    initialServiceId = rows.reduce((best, s) =>
      Math.abs(s.scheduledAt.getTime() - nowMs) <
      Math.abs(best.scheduledAt.getTime() - nowMs)
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
