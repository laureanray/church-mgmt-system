// Browser-only helpers that turn a camera or a chosen file into the small JPEG
// face recognition is sent. The sizes and the motion arithmetic are pure and
// live in lib/face-policy.ts; this file is the canvas plumbing around them.

import {
  FACE_JPEG_QUALITY,
  MOTION_SAMPLE_HEIGHT,
  MOTION_SAMPLE_WIDTH,
  fitWithin,
  toGrayscale,
} from "@/lib/face-policy";

type Source = HTMLVideoElement | ImageBitmap;

function sourceSize(source: Source) {
  return source instanceof HTMLVideoElement
    ? { width: source.videoWidth, height: source.videoHeight }
    : { width: source.width, height: source.height };
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the photo"))),
      "image/jpeg",
      FACE_JPEG_QUALITY,
    ),
  );
}

/**
 * Draw `source` into a JPEG no larger than `maxEdge` on its long side. A front
 * camera's preview is mirrored on screen with CSS only; the frame drawn here
 * is the camera's own, so the photo shows the person, not their reflection.
 */
export function captureJpeg(source: Source, maxEdge: number): Promise<Blob> {
  const size = sourceSize(source);
  if (!size.width || !size.height) {
    return Promise.reject(new Error("The camera has not started yet"));
  }
  const { width, height } = fitWithin(size.width, size.height, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("This browser cannot capture photos"));
  context.drawImage(source, 0, 0, width, height);
  return toJpeg(canvas);
}

/**
 * A chosen photo file, scaled down and re-encoded as a JPEG. Honours the EXIF
 * rotation a phone camera writes, so a portrait photo is not enrolled sideways.
 */
export async function fileToJpeg(file: Blob, maxEdge: number): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("That file could not be read as a photo. Use a JPEG or PNG.");
  }
  try {
    return await captureJpeg(bitmap, maxEdge);
  } finally {
    bitmap.close();
  }
}

/**
 * The motion sample: the current video frame shrunk to 32×24 grayscale.
 * Reuses `canvas` between calls; it is created once per scan loop.
 */
export function sampleMotion(video: HTMLVideoElement, canvas: HTMLCanvasElement): Uint8Array | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  canvas.width = MOTION_SAMPLE_WIDTH;
  canvas.height = MOTION_SAMPLE_HEIGHT;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(video, 0, 0, MOTION_SAMPLE_WIDTH, MOTION_SAMPLE_HEIGHT);
  const { data } = context.getImageData(0, 0, MOTION_SAMPLE_WIDTH, MOTION_SAMPLE_HEIGHT);
  return toGrayscale(data);
}

export type CameraStatus = "idle" | "starting" | "live" | "denied" | "unavailable";

/** Why the camera would not start, as a status and a sentence for the screen. */
export function describeCameraError(error: unknown): { status: CameraStatus; message: string } {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return {
      status: "denied",
      message: "Camera access was blocked. Allow the camera for this site in the browser’s settings, then try again.",
    };
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return { status: "unavailable", message: "No camera was found on this device." };
  }
  if (name === "NotReadableError") {
    return { status: "unavailable", message: "The camera is in use by another app or tab." };
  }
  if (typeof navigator !== "undefined" && !navigator.mediaDevices?.getUserMedia) {
    return {
      status: "unavailable",
      message: "This browser cannot use the camera here. It needs HTTPS (or localhost).",
    };
  }
  return { status: "unavailable", message: "The camera could not be started." };
}
