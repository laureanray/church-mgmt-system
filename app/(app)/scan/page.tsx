import { asc, desc, eq, gte, lt } from "drizzle-orm";

import { reactivateMember } from "@/app/(app)/members/actions";
import {
  addVisitor,
  checkInByFace,
  checkInMember,
  recordAttendance,
  searchMembersForCheckIn,
} from "@/app/(app)/scan/actions";
import { db } from "@/db";
import { services } from "@/db/schema";
import { hasPermission, requirePermission } from "@/lib/auth-helpers";
import { topUpAllSchedules } from "@/lib/occurrences";
import { selectScanServices } from "@/lib/scan-selection";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { ScannerPanel } from "@/components/scan/scanner-panel";
import { faceCheckInEnabled, getFaceConsentNotice } from "@/server/faces";

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
  // Until Tencent is configured the camera keeps scanning QR codes, so a
  // deployment without the keys behaves exactly as it did before.
  const face = faceCheckInEnabled();
  const canAddVisitor = hasPermission(user, "members.create");
  // A visitor's photo is taken as they are added only by someone who may
  // enrol faces.
  const offerVisitorFace =
    face && canAddVisitor && hasPermission(user, "members.update");

  const [upcoming, past, requested, consentNotice] = await Promise.all([
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
    offerVisitorFace ? getFaceConsentNotice(user) : undefined,
  ]);

  const { rows, initialServiceId } = selectScanServices(
    [...upcoming, ...past],
    requested.at(0),
    now.getTime(),
  );

  return (
    <PageContainer>
      <PageHeader
        title="Scan Attendance"
        description={
          face
            ? "Members check in by looking at the camera. Search by name for anyone it does not recognise."
            : "Scan a member's QR code, or search for them by name, to record their attendance."
        }
      />
      <ScannerPanel
        services={rows}
        initialServiceId={initialServiceId}
        canReactivate={hasPermission(user, "members.update")}
        recordScan={recordAttendance}
        checkIn={checkInMember}
        searchMembers={searchMembersForCheckIn}
        reactivate={reactivateMember}
        checkInByFace={face ? checkInByFace : undefined}
        addVisitor={canAddVisitor ? addVisitor : undefined}
        consentNotice={consentNotice}
      />
    </PageContainer>
  );
}
