"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  Camera,
  Loader2,
  ScanFace,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import type {
  FaceEnrollResult,
  FaceRemoveResult,
} from "@/app/(app)/members/actions";
import { FaceCaptureDialog } from "@/components/members/face-capture-dialog";
import { EmptyState } from "@/components/patterns/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FACE_ENROLL_MAX_EDGE } from "@/lib/face-policy";
import { formatDateTime } from "@/lib/format";
import { fileToJpeg } from "@/lib/image-capture";

export type FaceEnrollmentSummary = {
  /** ISO timestamp. */
  enrolledAt: string;
  enrolledByName: string | null;
  /** ISO timestamp of the member's consent, recorded at first enrolment. */
  consentAt: string;
  consentRecordedByName: string | null;
  /** Where the enrolment photo is served; see members/[id]/face-photo. */
  photoUrl: string;
};

/**
 * A member's face enrolment on their page: whether they can check in by
 * face, the photo they were enrolled with, and — for staff who may edit
 * members — taking, uploading, replacing and removing it.
 *
 * Nothing here is shown as enrolled until Tencent has accepted the photo, so
 * "Enrolled" always means the camera at the door will know them.
 *
 * A first enrolment asks for the member's consent: the notice is shown, and
 * the photo buttons stay disabled until the box is ticked. The server checks
 * it again. Replacing a photo keeps the consent already on record; removing
 * the face removes the consent with it.
 */
export function FaceEnrollmentCard({
  memberName,
  configured,
  enrollment,
  consentNotice,
  canEdit,
  enroll,
  remove,
  className,
}: {
  memberName: string;
  /** False when this deployment has no Tencent credentials. */
  configured: boolean;
  enrollment: FaceEnrollmentSummary | null;
  /** The notice a member agrees to before a first enrolment. */
  consentNotice: string;
  canEdit: boolean;
  /** Enrol the photo in the form data's `photo` field. */
  enroll: (formData: FormData) => Promise<FaceEnrollResult>;
  remove: () => Promise<FaceRemoveResult>;
  className?: string;
}) {
  // What this card last did, until the page's own props catch up with it.
  const [local, setLocal] = useState<FaceEnrollmentSummary | null | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [consented, setConsented] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    },
    [],
  );

  const current = local === undefined ? enrollment : local;

  /** Enrol `photo`; resolves to the refusal message, or null on success. */
  async function submit(photo: Blob): Promise<string | null> {
    const form = new FormData();
    form.set("photo", photo, "face.jpg");
    if (consented) form.set("consent", "yes");
    let result: FaceEnrollResult;
    try {
      result = await enroll(form);
    } catch {
      result = { status: "error", message: "Something went wrong enrolling the photo." };
    }
    if (result.status === "error") return result.message;

    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    blobUrlRef.current = URL.createObjectURL(photo);
    setLocal({
      enrolledAt: result.enrolledAt,
      enrolledByName: result.enrolledByName,
      consentAt: result.consentAt,
      consentRecordedByName: result.consentRecordedByName,
      photoUrl: blobUrlRef.current,
    });
    setError(null);
    toast.success(`${memberName} can now check in by face`);
    return null;
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setError(await submit(await fileToJpeg(file, FACE_ENROLL_MAX_EDGE)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that photo.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function confirmRemove() {
    setBusy(true);
    setError(null);
    try {
      const result = await remove();
      if (result.status === "error") {
        setError(result.message);
      } else {
        setLocal(null);
        // Consent went with the face; a new enrolment asks again.
        setConsented(false);
        toast.success(`${memberName}’s face was removed`);
      }
    } catch {
      setError("Something went wrong removing the face.");
    } finally {
      setBusy(false);
      setConfirmingRemove(false);
    }
  }

  // A replacement keeps the consent on record; a first enrolment needs it now.
  const blocked = busy || (!current && !consented);
  const consentId = useId();

  const actions =
    configured && canEdit ? (
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={blocked}
          onClick={() => setCapturing(true)}
        >
          <Camera className="size-4" />
          {current ? "Retake" : "Take photo"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={blocked}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="size-4" />
          {current ? "Replace" : "Upload photo"}
        </Button>
        {current ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => setConfirmingRemove(true)}
            aria-label={`Remove ${memberName}’s face`}
          >
            <Trash2 className="size-4 text-destructive" />
            Remove
          </Button>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => void upload(event.target.files?.[0])}
        />
      </div>
    ) : null;

  return (
    <Card className={className} aria-busy={busy || undefined}>
      <CardHeader>
        <CardTitle className="text-base">Face Check-in</CardTitle>
        {configured ? (
          <CardAction>
            <Badge variant={current ? "brand" : "outline"}>
              {current ? "Enrolled" : "Not enrolled"}
            </Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {!configured ? (
          <EmptyState
            variant="inline"
            className="py-4"
            icon={ScanFace}
            title="Face check-in is not set up"
            description="An administrator turns it on with the Tencent Cloud settings described in the README."
          />
        ) : current ? (
          <div className="flex items-center gap-3">
            <div className="relative size-20 shrink-0 overflow-hidden rounded-md border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- a private, per-member photo behind a permission check; nothing for next/image to optimise or cache */}
              <img
                src={current.photoUrl}
                alt={`Enrolment photo of ${memberName}`}
                className="size-full object-cover"
              />
              {busy ? (
                <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
                </div>
              ) : null}
            </div>
            <div className="min-w-0 space-y-0.5 text-sm">
              <p className="font-medium">Checks in by face</p>
              <p className="text-muted-foreground">
                Enrolled {formatDateTime(current.enrolledAt)} by{" "}
                {current.enrolledByName ?? "a former staff account"}
              </p>
              <p className="flex items-start gap-1 text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                <span>
                  Consent recorded {formatDateTime(current.consentAt)} by{" "}
                  {current.consentRecordedByName ?? "a former staff account"}
                </span>
              </p>
            </div>
          </div>
        ) : (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            {busy ? (
              <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden />
            ) : null}
            {busy
              ? "Enrolling…"
              : canEdit
                ? "With their consent, take or upload a clear photo of their face, and the camera at the door will check them in."
                : "Not enrolled yet. They check in by name at the door."}
          </p>
        )}

        {configured && canEdit && !current ? (
          <div className="space-y-2 rounded-md border bg-muted/40 p-3">
            <p className="text-xs font-medium">Consent notice</p>
            <div
              className="max-h-40 overflow-y-auto text-xs whitespace-pre-line text-muted-foreground"
              tabIndex={0}
              aria-label="Consent notice"
            >
              {consentNotice}
            </div>
            <label
              htmlFor={consentId}
              className="flex items-start gap-2 border-t pt-2 text-sm"
            >
              <Checkbox
                id={consentId}
                checked={consented}
                onCheckedChange={(checked) => setConsented(checked === true)}
                disabled={busy}
                className="mt-0.5"
              />
              <span>
                {memberName} has read this notice, or had it read to them, and
                agrees.
              </span>
            </label>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {actions}
      </CardContent>

      {configured && canEdit ? (
        <FaceCaptureDialog
          open={capturing}
          onOpenChange={setCapturing}
          onUse={submit}
        />
      ) : null}

      <Dialog
        open={confirmingRemove}
        onOpenChange={(open) => {
          if (!busy) setConfirmingRemove(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {memberName}’s face?</DialogTitle>
            <DialogDescription>
              The photo and the record of their consent are deleted here and
              from face recognition. They will check in by name until they
              consent again and a new photo is taken.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />} disabled={busy}>
              Cancel
            </DialogClose>
            <Button variant="destructive" onClick={confirmRemove} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
