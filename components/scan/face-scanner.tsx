"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  CameraOff,
  CheckCircle2,
  Loader2,
  ScanFace,
  SwitchCamera,
  UserRoundSearch,
  UserX,
  XCircle,
} from "lucide-react";

import type { CheckInResult, FaceScanResult } from "@/app/(app)/scan/actions";
import { MemberStatusBadge } from "@/components/members/member-status-badge";
import { Button } from "@/components/ui/button";
import { useCamera } from "@/hooks/use-camera";
import { isLapsed, type MemberStatus } from "@/lib/constants";
import {
  FACE_FRAME_MAX_EDGE,
  FACE_WELCOME_COOLDOWN_MS,
  FaceScanGate,
  motionBetween,
} from "@/lib/face-policy";
import { formatTime } from "@/lib/format";
import { captureJpeg, sampleMotion, type CameraStatus } from "@/lib/image-capture";
import { cn } from "@/lib/utils";
import type { CheckIn } from "@/server/attendance";

/** What is laid over the camera picture. */
export type FaceScannerOverlay =
  | {
      kind: "welcome";
      memberName: string;
      memberStatus: MemberStatus;
      /** `duplicate`: they were already checked in, at `at`. */
      status: CheckIn["status"];
      at: string;
    }
  | { kind: "confirm"; memberId: string; memberName: string; memberStatus: MemberStatus }
  | { kind: "no_match" }
  /** Something the person in front of the camera can fix: step closer. */
  | { kind: "hint"; message: string }
  /** Something they cannot: a key, billing or connection problem. */
  | { kind: "problem"; message: string };

/** How long each overlay stays up before the camera goes back to looking. */
const OVERLAY_MS: Record<Exclude<FaceScannerOverlay["kind"], "confirm">, number> = {
  welcome: FACE_WELCOME_COOLDOWN_MS,
  no_match: 3000,
  hint: 2500,
  problem: 8000,
};
/** A question waits this long for the usher before the camera moves on. */
const CONFIRM_TIMEOUT_MS = 20_000;
/** How often the loop looks at the picture for movement. */
const TICK_MS = 150;

/**
 * The face camera on the check-in screen, drawn from its props alone so that
 * Storybook can show every state without a camera or a server.
 */
export function FaceScannerView({
  active,
  camera,
  cameraMessage,
  videoRef,
  mirrored = true,
  looking = false,
  overlay = null,
  confirmBusy = false,
  onConfirm,
  onReject,
  onRetry,
  onSwitchCamera,
}: {
  /** False until a service is chosen; the camera stays off until then. */
  active: boolean;
  camera: CameraStatus;
  cameraMessage?: string | null;
  videoRef?: RefObject<HTMLVideoElement | null>;
  /** Show the picture mirror-image, as people expect of a front camera. */
  mirrored?: boolean;
  /** A frame is with face recognition now. */
  looking?: boolean;
  overlay?: FaceScannerOverlay | null;
  confirmBusy?: boolean;
  onConfirm?: () => void;
  onReject?: () => void;
  onRetry?: () => void;
  onSwitchCamera?: () => void;
}) {
  const live = active && camera === "live";
  const cameraOff = camera === "denied" || camera === "unavailable";

  return (
    <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-xl border bg-black">
      <video
        ref={videoRef}
        muted
        playsInline
        aria-hidden
        className={cn(
          "size-full object-cover",
          mirrored && "-scale-x-100",
          !live && "hidden",
        )}
      />

      {live ? (
        <>
          <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3">
            <p className="rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
              One person at a time · look at the camera
            </p>
            {onSwitchCamera ? (
              <Button
                size="icon-sm"
                variant="secondary"
                onClick={onSwitchCamera}
                aria-label="Switch camera"
              >
                <SwitchCamera className="size-4" />
              </Button>
            ) : null}
          </div>
          <p
            className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs text-white/80"
            aria-live="polite"
          >
            {looking ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Recognising…
              </>
            ) : (
              <>
                <ScanFace className="size-3.5" aria-hidden />
                Ready
              </>
            )}
          </p>
        </>
      ) : null}

      {!active ? (
        <Placeholder icon={ScanFace}>Select a service to start the camera.</Placeholder>
      ) : camera === "starting" || camera === "idle" ? (
        <Placeholder icon={Loader2} spin>
          Starting camera…
        </Placeholder>
      ) : cameraOff ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-white/70">
          <CameraOff className="size-8" aria-hidden />
          <p className="text-sm font-medium text-white">Camera unavailable</p>
          <p className="max-w-xs text-xs">
            {cameraMessage ?? "The camera could not be started."} Check people
            in by name below meanwhile.
          </p>
          {onRetry ? (
            <Button size="sm" variant="secondary" onClick={onRetry} className="mt-1">
              Retry camera
            </Button>
          ) : null}
        </div>
      ) : null}

      {live && overlay ? (
        <OverlayCard
          overlay={overlay}
          confirmBusy={confirmBusy}
          onConfirm={onConfirm}
          onReject={onReject}
        />
      ) : null}
    </div>
  );
}

function Placeholder({
  icon: Icon,
  spin = false,
  children,
}: {
  icon: typeof ScanFace;
  spin?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-white/70">
      <Icon className={cn("size-8", spin && "animate-spin")} aria-hidden />
      <p className="text-sm">{children}</p>
    </div>
  );
}

function OverlayCard({
  overlay,
  confirmBusy,
  onConfirm,
  onReject,
}: {
  overlay: FaceScannerOverlay;
  confirmBusy: boolean;
  onConfirm?: () => void;
  onReject?: () => void;
}) {
  const frame =
    "absolute inset-x-3 bottom-3 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg";

  switch (overlay.kind) {
    case "welcome": {
      const again = overlay.status === "duplicate";
      return (
        <div role="status" className={frame}>
          <div className="flex items-center gap-3">
            {again ? (
              <XCircle className="size-8 shrink-0 text-warning" aria-hidden />
            ) : (
              <CheckCircle2 className="size-8 shrink-0 text-success" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold">
                {again ? overlay.memberName : `Welcome, ${firstName(overlay.memberName)}!`}
              </p>
              <p className="text-sm text-muted-foreground">
                {again
                  ? `Already checked in at ${formatTime(overlay.at)}`
                  : `${overlay.memberName} · checked in ${formatTime(overlay.at)}`}
              </p>
            </div>
            {isLapsed(overlay.memberStatus) || overlay.memberStatus === "visitor" ? (
              <MemberStatusBadge status={overlay.memberStatus} />
            ) : null}
          </div>
        </div>
      );
    }
    case "confirm":
      return (
        <div role="alertdialog" aria-label="Confirm who this is" className={frame}>
          <div className="flex items-center gap-3">
            <UserRoundSearch className="size-8 shrink-0 text-info" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted-foreground">Is this</p>
              <p className="truncate text-lg font-semibold">{overlay.memberName}?</p>
            </div>
            <MemberStatusBadge status={overlay.memberStatus} />
          </div>
          <div className="mt-3 flex gap-2">
            <Button className="flex-1" onClick={onConfirm} disabled={confirmBusy}>
              {confirmBusy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Yes, check in
            </Button>
            <Button variant="outline" className="flex-1" onClick={onReject} disabled={confirmBusy}>
              No
            </Button>
          </div>
        </div>
      );
    case "no_match":
      return (
        <div role="status" className={frame}>
          <div className="flex items-center gap-3">
            <UserX className="size-6 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-medium">Not recognised</p>
              <p className="text-sm text-muted-foreground">
                Check them in by name below. A visitor or a member without a
                photo will not be recognised.
              </p>
            </div>
          </div>
        </div>
      );
    case "hint":
      return (
        <div role="status" className={frame}>
          <p className="flex items-center gap-2 text-sm font-medium">
            <ScanFace className="size-5 shrink-0 text-info" aria-hidden />
            {overlay.message}
          </p>
        </div>
      );
    case "problem":
      return (
        <div role="alert" className={frame}>
          <p className="flex items-start gap-2 text-sm text-destructive">
            <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {overlay.message}
          </p>
        </div>
      );
  }
}

/** A welcome by first name; the full name follows underneath. */
function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/**
 * Face check-in on a live camera. It sends a frame to face recognition only
 * when something in the picture has moved recently, one request at a time —
 * a motion check on a tiny grayscale sample, not a face detector — so an
 * empty doorway costs nothing. See FaceScanGate in lib/face-policy.ts.
 *
 * A confident match is checked in straight away and welcomed; a likely one
 * asks the usher first; anything less points to the name search.
 */
export function FaceScanner({
  active,
  identify,
  confirm,
  onCheckedIn,
}: {
  active: boolean;
  /** Search one frame (FormData field `frame`) and check in a confident match. */
  identify: (formData: FormData) => Promise<FaceScanResult>;
  /** Check in the member the usher confirmed. */
  confirm: (memberId: string) => Promise<CheckInResult>;
  /** A check-in landed, or was already there: for the feed and the count. */
  onCheckedIn: (checkIn: CheckIn) => void;
}) {
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const camera = useCamera({ enabled: active, facingMode: facing });
  const [overlay, setOverlay] = useState<FaceScannerOverlay | null>(null);
  const [looking, setLooking] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const gateRef = useRef<FaceScanGate | null>(null);
  const gate = () => (gateRef.current ??= new FaceScanGate());

  // The loop outlives renders, so it reads the latest callbacks from here.
  const callbacks = useRef({ identify, onCheckedIn });
  useEffect(() => {
    callbacks.current = { identify, onCheckedIn };
  }, [identify, onCheckedIn]);

  // Each overlay but a question clears itself; the camera resumes meanwhile.
  useEffect(() => {
    if (!overlay) return;
    const ms = overlay.kind === "confirm" ? CONFIRM_TIMEOUT_MS : OVERLAY_MS[overlay.kind];
    const timer = setTimeout(() => {
      setOverlay(null);
      if (overlay.kind === "confirm") gate().resume();
    }, ms);
    return () => clearTimeout(timer);
  }, [overlay]);

  function welcome(checkIn: CheckIn, now: number) {
    const lingering = gate().recognised(checkIn.memberId, now);
    gate().pause(now, FACE_WELCOME_COOLDOWN_MS);
    // Still in front of the camera after their welcome: say nothing more.
    if (lingering && checkIn.status === "duplicate") return;
    setOverlay({
      kind: "welcome",
      memberName: checkIn.memberName,
      memberStatus: checkIn.memberStatus,
      status: checkIn.status,
      at: checkIn.at,
    });
    callbacks.current.onCheckedIn(checkIn);
  }

  useEffect(() => {
    const video = camera.videoRef.current;
    if (!active || camera.status !== "live" || !video) return;

    const sampleCanvas = document.createElement("canvas");
    let previous: Uint8Array | null = null;
    let stopped = false;

    async function tick() {
      if (stopped || document.hidden || !video) return;
      const now = performance.now();
      const sample = sampleMotion(video, sampleCanvas);
      if (!sample) return;
      gate().observe(motionBetween(previous, sample), now);
      previous = sample;
      if (!gate().canSend(now)) return;

      gate().sent(now);
      setLooking(true);
      try {
        const form = new FormData();
        form.set("frame", await captureJpeg(video, FACE_FRAME_MAX_EDGE), "frame.jpg");
        const result = await callbacks.current.identify(form);
        if (stopped) return;
        const at = performance.now();
        switch (result.status) {
          case "checked_in":
            welcome(result.checkIn, at);
            break;
          case "confirm":
            gate().pause(at, CONFIRM_TIMEOUT_MS);
            setOverlay({
              kind: "confirm",
              memberId: result.memberId,
              memberName: result.memberName,
              memberStatus: result.memberStatus,
            });
            break;
          case "no_match":
            gate().pause(at, OVERLAY_MS.no_match);
            setOverlay({ kind: "no_match" });
            break;
          case "no_face":
            break;
          case "problem":
            if (result.kind === "unavailable") {
              gate().pause(at, OVERLAY_MS.problem);
              setOverlay({ kind: "problem", message: result.message });
            } else {
              setOverlay({ kind: "hint", message: result.message });
            }
            break;
        }
      } catch {
        if (stopped) return;
        gate().pause(performance.now(), OVERLAY_MS.problem);
        setOverlay({
          kind: "problem",
          message: "Face recognition could not be reached. Check people in by name meanwhile.",
        });
      } finally {
        gate().settled();
        if (!stopped) setLooking(false);
      }
    }

    const timer = setInterval(() => void tick(), TICK_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
    // camera.videoRef is a stable ref object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, camera.status]);

  async function confirmMatch() {
    if (overlay?.kind !== "confirm") return;
    setConfirmBusy(true);
    try {
      const result = await confirm(overlay.memberId);
      gate().resume();
      if (result.status === "error") {
        gate().pause(performance.now(), OVERLAY_MS.problem);
        setOverlay({ kind: "problem", message: result.message });
      } else {
        welcome(result, performance.now());
      }
    } catch {
      gate().resume();
      setOverlay({ kind: "problem", message: "Something went wrong recording attendance." });
    } finally {
      setConfirmBusy(false);
    }
  }

  function rejectMatch() {
    gate().resume();
    gate().pause(performance.now(), FACE_WELCOME_COOLDOWN_MS);
    setOverlay({ kind: "no_match" });
  }

  return (
    <FaceScannerView
      active={active}
      camera={camera.status}
      cameraMessage={camera.message}
      videoRef={camera.videoRef}
      mirrored={facing === "user"}
      looking={looking}
      overlay={overlay}
      confirmBusy={confirmBusy}
      onConfirm={confirmMatch}
      onReject={rejectMatch}
      onRetry={camera.retry}
      onSwitchCamera={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
    />
  );
}
