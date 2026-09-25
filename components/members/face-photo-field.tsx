"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Upload, X } from "lucide-react";

import { FaceCaptureDialog } from "@/components/members/face-capture-dialog";
import { FaceConsentNotice } from "@/components/members/face-consent-notice";
import { Button } from "@/components/ui/button";
import { FACE_CONSENT_FIELD, FACE_PHOTO_FIELD } from "@/lib/face-form";
import { FACE_ENROLL_MAX_EDGE } from "@/lib/face-policy";
import { fileToJpeg } from "@/lib/image-capture";

/**
 * The optional face step inside a form that creates someone — the new-member
 * form, or adding a visitor at the door. Consent comes first; once it is
 * ticked, a photo can be taken with the camera or uploaded. Both travel with
 * the form's own submit: the tick as `faceConsent`, the photo (already scaled
 * to a JPEG) as the file `facePhoto`.
 *
 * Nothing is enrolled here. The form's action enrols the face with the
 * record, and a photo Tencent refuses comes back as `errors.facePhoto`.
 */
export function FacePhotoField({
  notice,
  subject = "They",
  errors,
  disabled = false,
}: {
  notice: string;
  /** Who is agreeing, for the consent sentence. */
  subject?: string;
  errors?: { facePhoto?: string; faceConsent?: string };
  disabled?: boolean;
}) {
  const [consented, setConsented] = useState(false);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  // The form submits files from a file input, so the chosen photo is placed
  // in a hidden one. Cleared along with the photo.
  useEffect(() => {
    const input = fileInputRef.current;
    if (!input || typeof DataTransfer === "undefined") return;
    const transfer = new DataTransfer();
    if (photo) {
      transfer.items.add(new File([photo.blob], "face.jpg", { type: "image/jpeg" }));
    }
    input.files = transfer.files;
  }, [photo]);

  useEffect(() => {
    if (!photo) return;
    return () => URL.revokeObjectURL(photo.url);
  }, [photo]);

  // A form reset empties the hidden file input; follow it, so the preview
  // never shows a photo the form would no longer send.
  useEffect(() => {
    const form = fileInputRef.current?.form;
    if (!form) return;
    function onReset() {
      setPhoto(null);
      setConsented(false);
    }
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  function keep(blob: Blob) {
    setReadError(null);
    setPhoto({ blob, url: URL.createObjectURL(blob) });
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setReading(true);
    setReadError(null);
    try {
      keep(await fileToJpeg(file, FACE_ENROLL_MAX_EDGE));
    } catch (error) {
      setReadError(error instanceof Error ? error.message : "Could not read that photo.");
    } finally {
      setReading(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  const photoError = readError ?? errors?.facePhoto;
  const busy = disabled || reading;

  return (
    <div className="space-y-3">
      <FaceConsentNotice
        notice={notice}
        subject={subject}
        name={FACE_CONSENT_FIELD}
        checked={consented}
        onCheckedChange={(checked) => {
          setConsented(checked);
          // No consent, no photo: withdrawing the tick drops one already taken.
          if (!checked) setPhoto(null);
        }}
        disabled={disabled}
        error={errors?.faceConsent}
      />

      {photo ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local blob URL, which next/image cannot optimise */}
          <img
            src={photo.url}
            alt="Photo for face check-in"
            className="size-20 shrink-0 rounded-md border object-cover"
          />
          <div className="space-y-1 text-sm">
            <p className="font-medium">Photo ready</p>
            <p className="text-muted-foreground">
              It is checked by face recognition when you save.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setCapturing(true)}
                disabled={busy}
              >
                <Camera className="size-4" />
                Retake
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setPhoto(null)}
                disabled={busy}
              >
                <X className="size-4" />
                Remove photo
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setCapturing(true)}
            disabled={busy || !consented}
          >
            <Camera className="size-4" />
            Take photo
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => uploadRef.current?.click()}
            disabled={busy || !consented}
          >
            {reading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Upload photo
          </Button>
        </div>
      )}

      {photoError ? (
        <p role="alert" className="text-sm text-destructive">
          {photoError}
        </p>
      ) : !consented && !photo ? (
        <p className="text-xs text-muted-foreground">
          Optional. Without a photo they check in by name.
        </p>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        name={FACE_PHOTO_FIELD}
        className="hidden"
        tabIndex={-1}
        aria-hidden
      />
      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => void upload(event.target.files?.[0])}
      />

      <FaceCaptureDialog
        open={capturing}
        onOpenChange={setCapturing}
        onUse={async (blob) => {
          keep(blob);
          return null;
        }}
      />
    </div>
  );
}
