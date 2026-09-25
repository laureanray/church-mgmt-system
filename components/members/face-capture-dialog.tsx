"use client";

import { useEffect, useState, type RefObject } from "react";
import { Camera, CameraOff, Loader2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCamera } from "@/hooks/use-camera";
import { FACE_ENROLL_MAX_EDGE } from "@/lib/face-policy";
import { captureJpeg, type CameraStatus } from "@/lib/image-capture";

/** Where the dialog is: the camera's own states, then a photo to confirm. */
export type FaceCaptureStage = Exclude<CameraStatus, "idle"> | "captured";

/**
 * The dialog's body, with the camera passed in rather than started here, so
 * Storybook can show every stage without one.
 */
export function FaceCaptureView({
  stage,
  videoRef,
  cameraMessage,
  previewUrl,
  error,
  busy = false,
  onCapture,
  onRetake,
  onUse,
  onRetry,
}: {
  stage: FaceCaptureStage;
  videoRef?: RefObject<HTMLVideoElement | null>;
  /** Why the camera is off, for `denied` and `unavailable`. */
  cameraMessage?: string | null;
  /** The captured photo, for `captured`. */
  previewUrl?: string | null;
  /** Why the last photo was refused — Tencent's reason, in plain words. */
  error?: string | null;
  /** The photo is being enrolled. */
  busy?: boolean;
  onCapture: () => void;
  onRetake: () => void;
  onUse: () => void;
  onRetry: () => void;
}) {
  const cameraOff = stage === "denied" || stage === "unavailable";

  return (
    <>
      <DialogHeader>
        <DialogTitle>Take a photo for check-in</DialogTitle>
        <DialogDescription>
          One face, looking at the camera, in good light — no sunglasses, mask
          or hat brim over the eyes.
        </DialogDescription>
      </DialogHeader>

      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border bg-black">
        {/* Always mounted, so a starting stream has somewhere to go. Mirrored,
            as people expect of a front camera; the photo itself is not. */}
        <video
          ref={videoRef}
          muted
          playsInline
          aria-hidden
          className={
            stage === "live"
              ? "size-full -scale-x-100 object-cover"
              : "hidden"
          }
        />
        {stage === "live" ? (
          <div
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-1/2 h-3/4 w-5/12 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-dashed border-white/60"
          />
        ) : null}
        {stage === "captured" && previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local blob URL, which next/image cannot optimise
          <img
            src={previewUrl}
            alt="The photo just taken"
            className="size-full object-cover"
          />
        ) : null}
        {stage === "starting" ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white/70">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Starting camera…
          </div>
        ) : null}
        {cameraOff ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-white/70">
            <CameraOff className="size-8" aria-hidden />
            <p className="text-sm font-medium text-white">Camera unavailable</p>
            <p className="max-w-xs text-xs">
              {cameraMessage ?? "The camera could not be started."} You can
              upload a photo instead.
            </p>
            <Button size="sm" variant="secondary" onClick={onRetry} className="mt-1">
              Try again
            </Button>
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        {stage === "captured" ? (
          <>
            <Button variant="outline" onClick={onRetake} disabled={busy}>
              <RotateCcw className="size-4" />
              Retake
            </Button>
            <Button onClick={onUse} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {busy ? "Enrolling…" : "Use this photo"}
            </Button>
          </>
        ) : (
          <>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={onCapture} disabled={stage !== "live"}>
              <Camera className="size-4" />
              Take photo
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  );
}

/**
 * Take an enrolment photo with this device's front camera. The camera runs
 * only while the dialog is open and no photo is waiting to be confirmed.
 *
 * `onUse` enrols the photo and resolves to null when it was accepted — the
 * dialog closes — or to the reason it was refused, shown for a retake.
 */
export function FaceCaptureDialog({
  open,
  onOpenChange,
  onUse,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUse: (photo: Blob) => Promise<string | null>;
}) {
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const camera = useCamera({ enabled: open && !photo });

  // The preview's object URL is freed when the photo is replaced or dropped.
  useEffect(() => {
    if (!photo) return;
    return () => URL.revokeObjectURL(photo.url);
  }, [photo]);

  function reset() {
    setPhoto(null);
    setError(null);
  }

  async function capture() {
    const video = camera.videoRef.current;
    if (!video) return;
    try {
      setError(null);
      const blob = await captureJpeg(video, FACE_ENROLL_MAX_EDGE);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not take the photo.");
    }
  }

  async function use() {
    if (!photo || busy) return;
    setBusy(true);
    try {
      const refused = await onUse(photo.blob);
      if (refused) {
        setError(refused);
      } else {
        reset();
        onOpenChange(false);
      }
    } finally {
      setBusy(false);
    }
  }

  const stage: FaceCaptureStage = photo
    ? "captured"
    : camera.status === "idle"
      ? "starting"
      : camera.status;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <FaceCaptureView
          stage={stage}
          videoRef={camera.videoRef}
          cameraMessage={camera.message}
          previewUrl={photo?.url ?? null}
          error={error}
          busy={busy}
          onCapture={capture}
          onRetake={reset}
          onUse={use}
          onRetry={camera.retry}
        />
      </DialogContent>
    </Dialog>
  );
}
