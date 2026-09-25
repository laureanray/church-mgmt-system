"use client";

import { useActionState, useEffect, useState } from "react";
import { ExternalLink, Loader2, Save, ScanFace, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type {
  FaceConsentNoticeState,
  FacePurgeResult,
} from "@/app/(app)/settings/actions";
import { Field } from "@/components/form/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FACE_PURGE_CONFIRMATION, isPurgeConfirmed } from "@/lib/face-consent";

/** Where the privacy write-up lives; the repository is public. */
export const FACE_PRIVACY_DOC_URL =
  "https://github.com/laureanray/church-mgmt-system/blob/main/docs/privacy.md";

/**
 * Face check-in in Settings: whether it is on, how many members are enrolled,
 * the consent notice they agree to (editable by the church), and the purge
 * for a church that stops using it.
 */
export function FaceSettingsCard({
  configured,
  enrolledCount,
  notice,
  canEdit,
  saveNotice,
  purge,
}: {
  /** Tencent credentials and a group are set on this deployment. */
  configured: boolean;
  enrolledCount: number;
  /** The notice in force — the church's own, or the built-in wording. */
  notice: string;
  /** May change settings: reword the notice, purge. */
  canEdit: boolean;
  saveNotice: (
    prev: FaceConsentNoticeState,
    formData: FormData,
  ) => Promise<FaceConsentNoticeState>;
  purge: (confirmation: string) => Promise<FacePurgeResult>;
}) {
  const [state, formAction, saving] = useActionState(saveNotice, undefined);
  const [purging, setPurging] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [count, setCount] = useState(enrolledCount);

  useEffect(() => {
    if (state?.ok) toast.success(state.message ?? "Saved");
  }, [state]);

  async function confirmPurge() {
    setPurging(true);
    setPurgeError(null);
    try {
      const result = await purge(typed);
      if (result.status === "error") {
        setPurgeError(result.message);
        return;
      }
      setCount(0);
      setConfirmOpen(false);
      setTyped("");
      toast.success(
        `Purged face data for ${result.removed} ${result.removed === 1 ? "member" : "members"}`,
      );
    } catch {
      setPurgeError("Something went wrong purging face data.");
    } finally {
      setPurging(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScanFace className="size-4 text-muted-foreground" aria-hidden />
          Face check-in
        </CardTitle>
        <CardDescription>
          {!configured
            ? "Off on this deployment. An administrator turns it on with the Tencent Cloud settings in the README."
            : count === 0
              ? "No members are enrolled yet. Each will be asked to consent to the notice below."
              : `${count} ${count === 1 ? "member is" : "members are"} enrolled, each with their consent to the notice below.`}
        </CardDescription>
        <CardAction>
          {configured ? (
            <Badge variant="success">On</Badge>
          ) : (
            <Badge variant="outline">Off</Badge>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-6">
        <a
          href={FACE_PRIVACY_DOC_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
        >
          How face data is kept and deleted
          <ExternalLink className="size-3.5" aria-hidden />
        </a>

        <form action={formAction} className="space-y-3">
          <Field
            label="Consent notice"
            htmlFor="face-consent-notice"
            hint="Shown before a member’s face is enrolled. Members already enrolled keep the wording they agreed to."
            error={state?.errors?.notice}
          >
            <Textarea
              id="face-consent-notice"
              name="notice"
              rows={10}
              defaultValue={notice}
              readOnly={!canEdit}
            />
          </Field>
          {canEdit ? (
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save notice
            </Button>
          ) : null}
        </form>

        {configured && canEdit ? (
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium">Purge all face data</p>
            <p className="text-sm text-muted-foreground">
              Deletes every member’s face from face recognition, and every
              photo and consent record here. For a church that stops using
              face check-in; it cannot be undone.
            </p>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(true)}
              disabled={count === 0 && !purgeError}
            >
              <Trash2 className="size-4 text-destructive" />
              Purge all face data
            </Button>
          </div>
        ) : null}
      </CardContent>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (purging) return;
          setConfirmOpen(open);
          if (!open) {
            setTyped("");
            setPurgeError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Purge all face data?</DialogTitle>
            <DialogDescription>
              Every enrolled face ({count}) is deleted from face recognition,
              with every photo and consent record here. Members will check in
              by name until they consent and are photographed again.
            </DialogDescription>
          </DialogHeader>
          <Field
            label={`Type “${FACE_PURGE_CONFIRMATION}” to confirm`}
            htmlFor="face-purge-confirmation"
            error={purgeError ?? undefined}
          >
            <Input
              id="face-purge-confirmation"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />} disabled={purging}>
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              onClick={confirmPurge}
              disabled={purging || !isPurgeConfirmed(typed)}
            >
              {purging ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Purge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
