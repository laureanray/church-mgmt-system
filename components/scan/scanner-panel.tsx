"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import {
  CameraOff,
  CheckCircle2,
  Keyboard,
  QrCode,
  UserPlus,
  UserX,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import type { ReactivateResult } from "@/app/(app)/members/actions";
import type {
  AddVisitorState,
  CheckInResult,
  FaceScanResult,
  ScanResult,
} from "@/app/(app)/scan/actions";
import { MemberStatusBadge } from "@/components/members/member-status-badge";
import { EmptyState } from "@/components/patterns/empty-state";
import { AddVisitorDialog } from "@/components/scan/add-visitor-dialog";
import { FaceScanner } from "@/components/scan/face-scanner";
import { NameSearchPanel } from "@/components/scan/name-search-panel";
import {
  ReactivateMemberDialog,
  type LapsedCheckIn,
} from "@/components/scan/reactivate-member-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isLapsed, type MemberStatus } from "@/lib/constants";
import { formatDateTime, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CheckIn, CheckInCandidate } from "@/server/attendance";

// Camera scanner is browser-only — load it without SSR.
const Scanner = dynamic(
  () => import("@yudiel/react-qr-scanner").then((m) => m.Scanner),
  {
    ssr: false,
    loading: () => (
      <div className="flex size-full items-center justify-center text-sm text-white/70">
        Starting camera…
      </div>
    ),
  },
);

type ServiceOption = {
  id: string;
  name: string;
  scheduledAt: Date;
  location: string | null;
};

type Feed = {
  key: number;
  /** Absent for a code that matched nobody. */
  memberId?: string;
  name: string;
  status: ScanResult["status"];
  /** The member's own status, so a visitor or lapsed member stands out. */
  memberStatus?: MemberStatus;
  at: Date;
};

const STATUS_META: Record<
  ScanResult["status"],
  { icon: typeof CheckCircle2; className: string; label: string }
> = {
  ok: {
    icon: CheckCircle2,
    className: "text-success",
    label: "Checked in",
  },
  duplicate: {
    icon: XCircle,
    className: "text-warning",
    label: "Already in",
  },
  not_found: {
    icon: UserX,
    className: "text-destructive",
    label: "Not found",
  },
  error: {
    icon: XCircle,
    className: "text-destructive",
    label: "Error",
  },
};

export function ScannerPanel({
  services,
  initialServiceId,
  canReactivate = false,
  recordScan,
  checkIn,
  searchMembers,
  reactivate,
  checkInByFace,
  addVisitor,
  consentNotice,
}: {
  services: ServiceOption[];
  initialServiceId?: string;
  /** Whether this user may edit members, and so answer the reactivate prompt. */
  canReactivate?: boolean;
  /** Check in whoever a scanned or typed QR code belongs to. */
  recordScan: (serviceId: string, scannedText: string) => Promise<ScanResult>;
  /** Check in a member picked by name. */
  checkIn: (serviceId: string, memberId: string) => Promise<CheckInResult>;
  searchMembers: (query: string) => Promise<CheckInCandidate[]>;
  reactivate: (memberId: string) => Promise<ReactivateResult>;
  /**
   * Recognise a face in a camera frame and check them in. Given only when
   * face recognition is configured; the camera scans QR codes otherwise.
   */
  checkInByFace?: (
    serviceId: string,
    formData: FormData,
  ) => Promise<FaceScanResult>;
  /**
   * Add a first-time visitor and check them in. Given only to staff who may
   * create members.
   */
  addVisitor?: (
    serviceId: string,
    prev: AddVisitorState,
    formData: FormData,
  ) => Promise<AddVisitorState>;
  /**
   * The consent notice, when a visitor's face can be enrolled as they are
   * added: face recognition is on and this user may enrol faces.
   */
  consentNotice?: string;
}) {
  const [serviceId, setServiceId] = useState(initialServiceId ?? "");
  const [feed, setFeed] = useState<Feed[]>([]);
  const [checkedInCount, setCheckedInCount] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [lapsed, setLapsed] = useState<LapsedCheckIn | null>(null);
  const [addingVisitor, setAddingVisitor] = useState(false);

  const busyRef = useRef(false);
  const lastRef = useRef<{ token: string; t: number }>({ token: "", t: 0 });
  const keyRef = useRef(0);

  const selectedService = services.find((s) => s.id === serviceId);

  function pushFeed(
    name: string,
    status: ScanResult["status"],
    member?: { id: string; status: MemberStatus },
  ) {
    keyRef.current += 1;
    const entry: Feed = {
      key: keyRef.current,
      memberId: member?.id,
      name,
      status,
      memberStatus: member?.status,
      at: new Date(),
    };
    setFeed((prev) => [entry, ...prev].slice(0, 30));
  }

  /**
   * `quiet` skips the toast, for a face check-in: the welcome on the camera
   * picture already says it, where the person at the door can see it.
   */
  function handleResult(res: ScanResult, { quiet = false } = {}) {
    switch (res.status) {
      case "ok":
        if (!quiet) toast.success(`${res.memberName} checked in`);
        pushFeed(res.memberName, "ok", {
          id: res.memberId,
          status: res.memberStatus,
        });
        setCheckedInCount((c) => c + 1);
        break;
      case "duplicate":
        if (!quiet) {
          toast.warning(
            `${res.memberName} was already checked in at ${formatTime(res.at)}`,
          );
        }
        pushFeed(res.memberName, "duplicate", {
          id: res.memberId,
          status: res.memberStatus,
        });
        break;
      case "not_found":
        toast.error("Unrecognized code — no matching member");
        pushFeed(`Unknown (${res.token.slice(0, 8)}…)`, "not_found");
        break;
      case "error":
        toast.error(res.message);
        break;
    }

    // Asked on a repeat scan too: the first prompt may have been dismissed
    // by accident, and the member is still lapsed.
    if (
      canReactivate &&
      (res.status === "ok" || res.status === "duplicate") &&
      isLapsed(res.memberStatus)
    ) {
      setLapsed({
        memberId: res.memberId,
        memberName: res.memberName,
        status: res.memberStatus,
      });
    }
  }

  async function processScan(raw: string) {
    const value = raw.trim();
    if (!value) return;
    if (!serviceId) {
      toast.error("Select a service first");
      return;
    }

    const now = Date.now();
    // Ignore the same code re-read within 3s (camera keeps the QR in frame).
    if (value === lastRef.current.token && now - lastRef.current.t < 3000) {
      return;
    }
    lastRef.current = { token: value, t: now };

    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const res = await recordScan(serviceId, value);
      handleResult(res);
    } catch {
      toast.error("Something went wrong recording attendance");
    } finally {
      busyRef.current = false;
    }
  }

  async function checkInByName(member: CheckInCandidate) {
    if (!serviceId) {
      toast.error("Select a service first");
      return false;
    }
    try {
      const res = await checkIn(serviceId, member.id);
      handleResult(res);
      return res.status === "ok" || res.status === "duplicate";
    } catch {
      toast.error("Something went wrong recording attendance");
      return false;
    }
  }

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const v = manual.trim();
    if (!v) return;
    void processScan(v);
    setManual("");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        {/* Service picker */}
        <Card>
          <CardContent className="space-y-2">
            <Label htmlFor="service">Recording attendance for</Label>
            <Select
              value={serviceId}
              onValueChange={(v) => setServiceId(v ?? "")}
              items={services.map((s) => ({ value: s.id, label: s.name }))}
            >
              <SelectTrigger id="service" className="w-full">
                <SelectValue placeholder="Select a service…" />
              </SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedService ? (
              <p className="text-xs text-muted-foreground">
                {formatDateTime(selectedService.scheduledAt)}
                {selectedService.location
                  ? ` · ${selectedService.location}`
                  : ""}
              </p>
            ) : services.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No services yet — create one first to scan against it.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* Camera viewport: faces when recognition is set up, QR codes otherwise */}
        {checkInByFace ? (
          <FaceScanner
            // Off while a visitor is being added: their photo needs the camera.
            active={Boolean(serviceId) && !addingVisitor}
            identify={(form) => checkInByFace(serviceId, form)}
            confirm={(memberId) => checkIn(serviceId, memberId)}
            onCheckedIn={(result: CheckIn) => handleResult(result, { quiet: true })}
          />
        ) : (
          <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-xl border bg-black">
            {serviceId && !cameraError ? (
              <Scanner
                onScan={(codes) => {
                  const value = codes?.[0]?.rawValue;
                  if (value) void processScan(value);
                }}
                onError={(err) => {
                  const message =
                    err instanceof Error ? err.message : "Camera unavailable";
                  setCameraError(message);
                }}
                constraints={{ facingMode: "environment" }}
                formats={["qr_code"]}
                scanDelay={400}
                components={{ finder: true }}
                styles={{
                  container: { width: "100%", height: "100%" },
                  video: {
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  },
                }}
              />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-2 p-6 text-center text-white/70">
                {cameraError ? (
                  <>
                    <CameraOff className="size-8" />
                    <p className="text-sm font-medium text-white">
                      Camera unavailable
                    </p>
                    <p className="max-w-xs text-xs">
                      {cameraError}. Use the manual entry below (works with USB
                      scanners too).
                    </p>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setCameraError(null)}
                      className="mt-1"
                    >
                      Retry camera
                    </Button>
                  </>
                ) : (
                  <>
                    <QrCode className="size-8" />
                    <p className="text-sm">
                      Select a service to start the camera.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <NameSearchPanel search={searchMembers} onSelect={checkInByName} />

        {addVisitor ? (
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <p className="font-medium">First time here?</p>
                <p className="text-muted-foreground">
                  Add them as a visitor and check them in
                  {consentNotice ? ", with a photo if they agree" : ""}.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  if (!serviceId) {
                    toast.error("Select a service first");
                    return;
                  }
                  setAddingVisitor(true);
                }}
              >
                <UserPlus className="size-4" />
                Add a visitor
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {/* Manual / USB scanner entry */}
        <Card>
          <CardContent>
            <form onSubmit={submitManual} className="space-y-2">
              <Label htmlFor="manual" className="flex items-center gap-1.5">
                <Keyboard className="size-3.5" />
                Manual entry / USB scanner
              </Label>
              <div className="flex gap-2">
                <Input
                  id="manual"
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  placeholder="Type or scan a member code, then Enter"
                  autoComplete="off"
                />
                <Button type="submit" variant="secondary">
                  Check in
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Live feed */}
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Live check-ins</CardTitle>
          <CardAction>
            <Badge
              variant="brand"
              size="lg"
              className="font-semibold tabular-nums"
            >
              <CheckCircle2 className="size-3.5" />
              {checkedInCount}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          {feed.length === 0 ? (
            <EmptyState
              variant="inline"
              title="Scanned members will appear here."
            />
          ) : (
            <ul className="space-y-1">
              {feed.map((f) => {
                const meta = STATUS_META[f.status];
                const Icon = meta.icon;
                return (
                  <li
                    key={f.key}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm odd:bg-muted/40"
                  >
                    <Icon className={cn("size-4 shrink-0", meta.className)} />
                    <span className="flex-1 truncate font-medium">
                      {f.name}
                    </span>
                    {f.memberStatus ? (
                      <MemberStatusBadge status={f.memberStatus} />
                    ) : null}
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatTime(f.at)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {addVisitor ? (
        <AddVisitorDialog
          open={addingVisitor}
          onOpenChange={setAddingVisitor}
          action={(prev, formData) => addVisitor(serviceId, prev, formData)}
          face={consentNotice ? { notice: consentNotice } : undefined}
          onAdded={(checkIn) => {
            toast.success(`${checkIn.memberName} added and checked in — welcome!`);
            pushFeed(checkIn.memberName, checkIn.status, {
              id: checkIn.memberId,
              status: checkIn.memberStatus,
            });
            if (checkIn.status === "ok") setCheckedInCount((c) => c + 1);
          }}
        />
      ) : null}

      <ReactivateMemberDialog
        checkIn={lapsed}
        reactivate={reactivate}
        onReactivated={(memberId) =>
          setFeed((prev) =>
            prev.map((entry) =>
              entry.memberId === memberId
                ? { ...entry, memberStatus: "active" }
                : entry,
            ),
          )
        }
        onClose={() => setLapsed(null)}
      />
    </div>
  );
}
