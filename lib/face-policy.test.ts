import { describe, expect, it } from "bun:test";

import {
  FACE_MOTION_WINDOW_MS,
  FACE_NETWORK_CODE,
  FACE_REPEAT_SUPPRESS_MS,
  FACE_SEND_INTERVAL_MS,
  FACE_TIMEOUT_CODE,
  FaceScanGate,
  MOTION_THRESHOLD,
  faceBand,
  faceProblem,
  fitWithin,
  isJpeg,
  motionBetween,
  toGrayscale,
} from "./face-policy";

describe("faceBand", () => {
  it("checks in at 90 and above", () => {
    expect(faceBand(100)).toBe("auto");
    expect(faceBand(90)).toBe("auto");
  });

  it("asks the usher between 80 and 90", () => {
    expect(faceBand(89.99)).toBe("confirm");
    expect(faceBand(80)).toBe("confirm");
  });

  it("treats anything lower, or nonsense, as a stranger", () => {
    expect(faceBand(79.9)).toBe("none");
    expect(faceBand(2.3)).toBe("none");
    expect(faceBand(Number.NaN)).toBe("none");
  });
});

describe("faceProblem", () => {
  it("keeps an empty frame quiet, whatever the prefix", () => {
    expect(faceProblem("InvalidParameterValue.NoFaceInPhoto").kind).toBe("no_face");
    expect(faceProblem("FailedOperation.ImageFacedetectFailed").kind).toBe("no_face");
  });

  it("tells the person how to fix a poor photo", () => {
    expect(faceProblem("InvalidParameterValue.FaceSizeTooSmall")).toEqual({
      kind: "photo",
      message: "The face is too small. Step closer to the camera.",
    });
    for (const code of [
      "FailedOperation.FaceQualityNotQualified",
      "FailedOperation.ImageResolutionTooSmall",
      "FailedOperation.ImageDecodeFailed",
    ]) {
      expect(faceProblem(code).kind).toBe("photo");
    }
  });

  it("reports rate limits and timeouts as busy", () => {
    expect(faceProblem("RequestLimitExceeded").kind).toBe("busy");
    expect(faceProblem("FailedOperation.RequestLimitExceeded").kind).toBe("busy");
    expect(faceProblem(FACE_TIMEOUT_CODE).kind).toBe("busy");
    expect(faceProblem(FACE_NETWORK_CODE).kind).toBe("busy");
  });

  it("sends key and billing problems to an administrator", () => {
    expect(faceProblem("AuthFailure.SignatureFailure")).toMatchObject({
      kind: "unavailable",
      message: expect.stringContaining("refused the access key"),
    });
    expect(faceProblem("ResourceUnavailable.InArrears").message).toContain("billing");
    expect(faceProblem("UnauthorizedOperation").kind).toBe("unavailable");
  });

  it("names an unknown code rather than hiding it", () => {
    expect(faceProblem("InternalError").message).toContain("(InternalError)");
  });
});

describe("fitWithin", () => {
  it("scales the longer side down to the limit, keeping the shape", () => {
    expect(fitWithin(1920, 1080, 640)).toEqual({ width: 640, height: 360 });
    expect(fitWithin(3024, 4032, 800)).toEqual({ width: 600, height: 800 });
  });

  it("never enlarges", () => {
    expect(fitWithin(320, 240, 640)).toEqual({ width: 320, height: 240 });
    expect(fitWithin(0, 0, 640)).toEqual({ width: 0, height: 0 });
  });
});

describe("isJpeg", () => {
  it("reads the magic bytes, not the name", () => {
    expect(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(isJpeg(new Uint8Array([]))).toBe(false);
  });
});

describe("motion", () => {
  it("converts RGBA to one luma byte per pixel", () => {
    expect([...toGrayscale([255, 255, 255, 255, 0, 0, 0, 255])]).toEqual([255, 0]);
  });

  it("measures the mean change between samples", () => {
    const a = new Uint8Array([10, 10, 10, 10]);
    expect(motionBetween(a, new Uint8Array([10, 10, 10, 10]))).toBe(0);
    expect(motionBetween(a, new Uint8Array([30, 10, 10, 30]))).toBe(10);
  });

  it("counts a first frame or a resized one as movement", () => {
    expect(motionBetween(null, new Uint8Array([1]))).toBe(255);
    expect(motionBetween(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(255);
  });
});

describe("FaceScanGate", () => {
  it("sends nothing while nothing moves", () => {
    const gate = new FaceScanGate();
    expect(gate.observe(MOTION_THRESHOLD - 1, 0)).toBe(false);
    expect(gate.canSend(0)).toBe(false);
  });

  it("sends within the window after motion, one request at a time", () => {
    const gate = new FaceScanGate();
    gate.observe(MOTION_THRESHOLD, 1000);
    expect(gate.canSend(1000)).toBe(true);
    gate.sent(1000);
    expect(gate.canSend(1000 + FACE_SEND_INTERVAL_MS)).toBe(false);
    gate.settled();
    expect(gate.canSend(1000 + FACE_SEND_INTERVAL_MS - 1)).toBe(false);
    expect(gate.canSend(1000 + FACE_SEND_INTERVAL_MS)).toBe(true);
    expect(gate.canSend(1000 + FACE_MOTION_WINDOW_MS + 1)).toBe(false);
  });

  it("holds off during a pause, and resumes early when asked", () => {
    const gate = new FaceScanGate();
    gate.observe(50, 0);
    gate.pause(0, 2500);
    expect(gate.canSend(100)).toBe(false);
    gate.resume();
    expect(gate.canSend(100)).toBe(true);
  });

  it("remembers who it welcomed, for a while", () => {
    const gate = new FaceScanGate();
    expect(gate.recognised("ana", 0)).toBe(false);
    expect(gate.recognised("ana", 10_000)).toBe(true);
    expect(gate.recognised("ruth", 10_000)).toBe(false);
    expect(gate.recognised("ruth", 10_000 + FACE_REPEAT_SUPPRESS_MS + 1)).toBe(false);
  });
});
