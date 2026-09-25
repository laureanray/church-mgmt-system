// The rules behind face check-in that involve no camera, network or database:
// what a match score means, what to tell an usher when Tencent refuses a
// photo, how large a captured image is, and when the scan loop may spend a
// request. Pure, so the unit suite covers all of it (lib/face-policy.test.ts).

// ---------------------------------------------------------------------------
// Match scores
// ---------------------------------------------------------------------------

/**
 * Tencent's similarity score for the best candidate, 0–100. Their published
 * error rates for a library of 10,000 faces: a score of 80 falsely matches
 * about 0.1% of strangers, 90 about 0.01%. A church directory is far smaller,
 * so these are conservative.
 */
export const FACE_AUTO_CHECK_IN_SCORE = 90;
export const FACE_CONFIRM_SCORE = 80;

/**
 * `auto` checks the member in; `confirm` asks the usher "Is this Ana?" first;
 * `none` is treated as a stranger.
 */
export type FaceBand = "auto" | "confirm" | "none";

export function faceBand(score: number): FaceBand {
  if (!Number.isFinite(score)) return "none";
  if (score >= FACE_AUTO_CHECK_IN_SCORE) return "auto";
  if (score >= FACE_CONFIRM_SCORE) return "confirm";
  return "none";
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * - `no_face`: nobody in the picture. The scan loop sees this constantly —
 *   someone walked past — so it is a quiet no-op there, never a toast.
 * - `photo`: a face, but not one Tencent will use. Worth telling the person
 *   in front of the camera how to fix it.
 * - `busy`: rate-limited or slow. Try again shortly.
 * - `unavailable`: a key, billing or account problem only an admin can fix.
 */
export type FaceProblemKind = "no_face" | "photo" | "busy" | "unavailable";

export type FaceProblem = {
  kind: FaceProblemKind;
  message: string;
};

/**
 * Keyed by the last segment of Tencent's error code, because the same
 * condition arrives under different prefixes depending on the action
 * (`InvalidParameterValue.NoFaceInPhoto`, `FailedOperation.…`).
 */
const PROBLEMS: Record<string, FaceProblem> = {
  NoFaceInPhoto: {
    kind: "no_face",
    message: "No face found. Face the camera, in good light.",
  },
  ImageFacedetectFailed: {
    kind: "no_face",
    message: "No face found. Face the camera, in good light.",
  },
  FaceSizeTooSmall: {
    kind: "photo",
    message: "The face is too small. Step closer to the camera.",
  },
  FaceQualityNotQualified: {
    kind: "photo",
    message:
      "The face is too dark, blurred or turned away. Face the camera in good light.",
  },
  ImageResolutionTooSmall: {
    kind: "photo",
    message: "The photo is too small. Use a larger, clearer one.",
  },
  ImageDecodeFailed: {
    kind: "photo",
    message: "That file could not be read as a photo. Use a JPEG or PNG.",
  },
  ImageSizeExceed: {
    kind: "photo",
    message: "The photo is too large.",
  },
  RequestLimitExceeded: {
    kind: "busy",
    message: "Face recognition is busy. Wait a moment and try again.",
  },
  RequestTimeout: {
    kind: "busy",
    message: "Face recognition did not answer in time. Try again.",
  },
};

const UNAVAILABLE_PREFIXES: [prefix: string, message: string][] = [
  [
    "AuthFailure.",
    "Face recognition is not set up correctly: Tencent Cloud refused the access key. Ask an administrator.",
  ],
  [
    "ResourceUnavailable.",
    "Face recognition is switched off on the Tencent Cloud account (billing or service status). Ask an administrator.",
  ],
  [
    "ResourcesSoldOut.",
    "Face recognition is switched off on the Tencent Cloud account (billing or service status). Ask an administrator.",
  ],
  [
    "UnauthorizedOperation",
    "The Tencent Cloud key is not allowed to use face recognition. Ask an administrator.",
  ],
];

/** What the app's own client reports when Tencent never answered. */
export const FACE_TIMEOUT_CODE = "ClientTimeout";
export const FACE_NETWORK_CODE = "ClientNetworkError";

/** The problem behind a Tencent error code, in words an usher can act on. */
export function faceProblem(code: string): FaceProblem {
  if (code === FACE_TIMEOUT_CODE || code === FACE_NETWORK_CODE) {
    return PROBLEMS.RequestTimeout;
  }
  const known = PROBLEMS[code.slice(code.lastIndexOf(".") + 1)];
  if (known) return known;
  for (const [prefix, message] of UNAVAILABLE_PREFIXES) {
    if (code.startsWith(prefix)) return { kind: "unavailable", message };
  }
  return {
    kind: "unavailable",
    message: `Face recognition failed (${code}). Try again, or check in by name.`,
  };
}

// ---------------------------------------------------------------------------
// Capture sizes
// ---------------------------------------------------------------------------

/**
 * Longest side of a scan frame. Tencent needs a face of at least 64 px
 * (`MinFaceSize` in the search), which a person at the door comfortably
 * clears at this size, and a 640 px JPEG is some 40–80 KB — far under the
 * 1 MB server-action body limit.
 */
export const FACE_FRAME_MAX_EDGE = 640;
/** Longest side of an enrolment photo: a little more detail for the record. */
export const FACE_ENROLL_MAX_EDGE = 800;
export const FACE_JPEG_QUALITY = 0.85;
/** Anything larger was not made by the capture code; the action refuses it. */
export const FACE_IMAGE_MAX_BYTES = 900 * 1024;
/** Tencent's smallest face for a search, in pixels. */
export const FACE_MIN_FACE_SIZE = 64;

/** Scale `width`×`height` down so its longer side is at most `maxEdge`. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** A JPEG starts FF D8 FF, whatever its extension or declared type. */
export function isJpeg(bytes: Uint8Array): boolean {
  return (
    bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  );
}

// ---------------------------------------------------------------------------
// Scan-loop gating
//
// Every search costs money, so the camera does not stream frames to Tencent.
// It watches for movement in a tiny grayscale copy of the picture — a motion
// check, not a face detector — and only while something has moved recently
// does it send a frame, one at a time and no more often than
// FACE_SEND_INTERVAL_MS. An empty doorway costs nothing; a person costs a
// handful of searches.
// ---------------------------------------------------------------------------

/** The motion sample: 32×24 grayscale pixels, drawn from the video frame. */
export const MOTION_SAMPLE_WIDTH = 32;
export const MOTION_SAMPLE_HEIGHT = 24;
/**
 * Mean absolute change per sample pixel (0–255) that counts as movement.
 * Sensor noise in a still, lit room stays around 1–3.
 */
export const MOTION_THRESHOLD = 8;
/** How long after the last movement frames are still sent. */
export const FACE_MOTION_WINDOW_MS = 3000;
/** The least time between two searches. */
export const FACE_SEND_INTERVAL_MS = 1200;
/** Pause after a check-in, while the welcome shows and the person moves on. */
export const FACE_WELCOME_COOLDOWN_MS = 2500;
/** A member recognised again within this window is not welcomed twice. */
export const FACE_REPEAT_SUPPRESS_MS = 45_000;

/**
 * Luma of an RGBA pixel buffer (what `getImageData` returns), one byte per
 * pixel. Integer weights of the Rec. 601 formula.
 */
export function toGrayscale(rgba: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(Math.floor(rgba.length / 4));
  for (let i = 0; i < out.length; i++) {
    const p = i * 4;
    out[i] = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
  }
  return out;
}

/**
 * Mean absolute difference between two grayscale samples, 0–255. Samples of
 * different sizes — the camera changed resolution — count as full movement.
 */
export function motionBetween(a: Uint8Array | null, b: Uint8Array): number {
  if (!a || a.length !== b.length || b.length === 0) return 255;
  let total = 0;
  for (let i = 0; i < b.length; i++) total += Math.abs(a[i] - b[i]);
  return total / b.length;
}

/**
 * When the scan loop may send a frame. The hook feeds it the clock and what
 * happened; the decisions live here so they can be tested without a camera.
 */
export class FaceScanGate {
  private lastMotionAt = -Infinity;
  private lastSentAt = -Infinity;
  private pausedUntil = -Infinity;
  private inFlight = false;
  private readonly recent = new Map<string, number>();

  /** Record the latest motion measurement; returns whether it counts. */
  observe(motion: number, now: number): boolean {
    if (motion < MOTION_THRESHOLD) return false;
    this.lastMotionAt = now;
    return true;
  }

  /** Whether a frame may go to Tencent now. */
  canSend(now: number): boolean {
    return (
      !this.inFlight &&
      now >= this.pausedUntil &&
      now - this.lastMotionAt <= FACE_MOTION_WINDOW_MS &&
      now - this.lastSentAt >= FACE_SEND_INTERVAL_MS
    );
  }

  sent(now: number): void {
    this.inFlight = true;
    this.lastSentAt = now;
  }

  /** The request answered, whatever the answer was. */
  settled(): void {
    this.inFlight = false;
  }

  /** Stop sending until `now + ms`: a welcome or a question is on screen. */
  pause(now: number, ms: number): void {
    this.pausedUntil = Math.max(this.pausedUntil, now + ms);
  }

  /** Lift a pause early — the usher answered the question. */
  resume(): void {
    this.pausedUntil = -Infinity;
  }

  /**
   * Note that `memberId` was recognised, and say whether they already were
   * within FACE_REPEAT_SUPPRESS_MS — someone lingering at the door.
   */
  recognised(memberId: string, now: number): boolean {
    for (const [id, at] of this.recent) {
      if (now - at > FACE_REPEAT_SUPPRESS_MS) this.recent.delete(id);
    }
    const seen = this.recent.has(memberId);
    this.recent.set(memberId, now);
    return seen;
  }
}
