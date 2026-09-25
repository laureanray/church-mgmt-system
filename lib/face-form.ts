// The optional face step of a form that creates a member — the new-member
// form, and adding a visitor at the door. Kept out of the "use server" action
// files, where every exported async function becomes a callable endpoint.

/** Form field names, shared by the photo field and the actions reading it. */
export const FACE_PHOTO_FIELD = "facePhoto";
export const FACE_CONSENT_FIELD = "faceConsent";

/** The photo (a JPEG) and the consent tick, or null when no photo was added. */
export async function readFaceFields(
  formData: FormData,
): Promise<{ photo: Uint8Array; consent: FormDataEntryValue | null } | null> {
  const file = formData.get(FACE_PHOTO_FIELD);
  if (!(file instanceof Blob) || file.size === 0) return null;
  return {
    photo: new Uint8Array(await file.arrayBuffer()),
    consent: formData.get(FACE_CONSENT_FIELD),
  };
}
