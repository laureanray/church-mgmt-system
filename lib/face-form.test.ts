import { describe, expect, it } from "bun:test";

import { FACE_CONSENT_FIELD, FACE_PHOTO_FIELD, readFaceFields } from "./face-form";

describe("readFaceFields", () => {
  it("reads the photo's bytes and the consent tick", async () => {
    const form = new FormData();
    form.set(FACE_PHOTO_FIELD, new Blob([new Uint8Array([0xff, 0xd8, 0xff])]), "face.jpg");
    form.set(FACE_CONSENT_FIELD, "yes");
    const face = await readFaceFields(form);
    expect([...(face?.photo ?? [])]).toEqual([0xff, 0xd8, 0xff]);
    expect(face?.consent).toBe("yes");
  });

  it("is null without a photo, or with an empty file input", async () => {
    const form = new FormData();
    form.set(FACE_CONSENT_FIELD, "yes");
    expect(await readFaceFields(form)).toBeNull();
    form.set(FACE_PHOTO_FIELD, new Blob([]), "");
    expect(await readFaceFields(form)).toBeNull();
  });

  it("ignores a text value posing as the photo", async () => {
    const form = new FormData();
    form.set(FACE_PHOTO_FIELD, "not a file");
    expect(await readFaceFields(form)).toBeNull();
  });

  it("keeps a missing tick as null, for the service to refuse", async () => {
    const form = new FormData();
    form.set(FACE_PHOTO_FIELD, new Blob([new Uint8Array([1])]), "face.jpg");
    expect((await readFaceFields(form))?.consent).toBeNull();
  });
});
