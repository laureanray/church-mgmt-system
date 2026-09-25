"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { recordAudit } from "@/lib/audit";
import { describeFields } from "@/lib/audit-diff";
import { requirePermission } from "@/lib/auth-helpers";
import {
  buildAllRows,
  buildRowsForService,
  getSettings,
  pingSheets,
  pushRows,
  saveSheetsConfig,
  type SyncResult,
} from "@/lib/sheets";
import { isServiceError } from "@/server/errors";
import * as facesService from "@/server/faces";

export type SaveSettingsState =
  | { ok?: boolean; error?: string; message?: string }
  | undefined;

export async function saveSheetsSettings(
  _prev: SaveSettingsState,
  formData: FormData,
): Promise<SaveSettingsState> {
  const actor = await requirePermission("settings.update");

  const url = String(formData.get("webhookUrl") ?? "").trim() || null;
  const secret = String(formData.get("webhookSecret") ?? "").trim() || null;

  if (url && !/^https:\/\//i.test(url)) {
    return { error: "Webhook URL must start with https://" };
  }
  if (url && !secret) {
    return { error: "Add a secret so the webhook can reject stray requests." };
  }

  await db.transaction(async (tx) => {
    const before = await getSettings(tx);
    const after = await saveSheetsConfig(url, secret, tx);
    // recordAudit redacts the webhook secret; the entry shows only that it
    // changed.
    await recordAudit(tx, {
      actorId: actor.id,
      action: "settings.update",
      entity: "settings",
      entityId: after.id,
      before: before ?? { id: after.id },
      after,
      summary: (fields) => `Changed settings: ${describeFields(fields)}`,
    });
  });
  revalidatePath("/settings");
  return { ok: true, message: url ? "Google Sheets connected." : "Settings saved." };
}

export async function testConnection(): Promise<SyncResult> {
  await requirePermission("settings.update");
  return pingSheets();
}

export async function syncAllAttendance(): Promise<SyncResult> {
  await requirePermission("services.sync");
  const rows = await buildAllRows();
  return pushRows(rows);
}

export async function syncServiceAttendance(
  serviceId: string,
): Promise<SyncResult> {
  await requirePermission("services.sync");
  const rows = await buildRowsForService(serviceId);
  return pushRows(rows);
}

export type FaceConsentNoticeState =
  | { ok?: boolean; errors?: Record<string, string>; message?: string }
  | undefined;

/** Reword the consent notice shown before a face is enrolled. */
export async function saveFaceConsentNotice(
  _prev: FaceConsentNoticeState,
  formData: FormData,
): Promise<FaceConsentNoticeState> {
  const actor = await requirePermission("settings.update");
  try {
    await facesService.saveFaceConsentNotice(actor, formData.get("notice"));
  } catch (error) {
    if (isServiceError(error) && error.code === "invalid") {
      // The schema validates a bare string, so its message has no field key.
      const message = Object.values(error.fields ?? {})[0] ?? error.message;
      return { errors: { notice: message }, message };
    }
    throw error;
  }
  revalidatePath("/settings");
  return { ok: true, message: "Consent notice saved." };
}

export type FacePurgeResult =
  | { status: "ok"; removed: number }
  | { status: "error"; message: string };

/** Delete every enrolled face, here and in Tencent. See purgeAllFaceData. */
export async function purgeFaceData(confirmation: string): Promise<FacePurgeResult> {
  const actor = await requirePermission("settings.update");
  let removed: number;
  try {
    ({ removed } = await facesService.purgeAllFaceData(actor, confirmation));
  } catch (error) {
    if (
      isServiceError(error) &&
      (error.code === "invalid" || error.code === "unavailable")
    ) {
      return { status: "error", message: error.message };
    }
    throw error;
  }
  revalidatePath("/settings");
  revalidatePath("/members", "layout");
  return { status: "ok", removed };
}
