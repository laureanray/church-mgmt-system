"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { describeCameraError, type CameraStatus } from "@/lib/image-capture";

type Outcome = { session: string; status: CameraStatus; message: string | null };

/**
 * A camera stream in a `<video>` that the caller renders — always, even while
 * the camera is starting, so the stream has somewhere to go. The stream stops
 * when `enabled` turns false or the component unmounts, which is what turns
 * the camera light off.
 */
export function useCamera({
  enabled,
  facingMode = "user",
}: {
  enabled: boolean;
  /** "user" for the front camera, "environment" for the back one. */
  facingMode?: "user" | "environment";
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [attempt, setAttempt] = useState(0);
  // Each start of the camera is a session; an outcome counts only for the
  // session it belongs to, so "starting" and "idle" need no state of their own.
  const session = enabled ? `${facingMode}:${attempt}` : null;
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    if (!session) return;
    const video = videoRef.current;
    let stream: MediaStream | null = null;
    let cancelled = false;

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        // Cleanup already ran while permission was being asked, and found no
        // stream to stop then; stop this one now.
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        if (!cancelled) setOutcome({ session, status: "live", message: null });
      } catch (error) {
        if (cancelled) return;
        setOutcome({ session, ...describeCameraError(error) });
      }
    })();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
      // The same session can start again (a retake), and must not inherit
      // this one's "live" before its own stream is playing.
      setOutcome(null);
    };
  }, [session, facingMode]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const current = session && outcome?.session === session ? outcome : null;
  const status: CameraStatus = !session ? "idle" : (current?.status ?? "starting");
  return { videoRef, status, message: current?.message ?? null, retry };
}
