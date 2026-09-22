"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth-helpers";
import {
  buildAllRows,
  buildRowsForService,
  pingSheets,
  pushRows,
  saveSheetsConfig,
  type SyncResult,
} from "@/lib/sheets";

export type SaveSettingsState =
  | { ok?: boolean; error?: string; message?: string }
  | undefined;

export async function saveSheetsSettings(
  _prev: SaveSettingsState,
  formData: FormData,
): Promise<SaveSettingsState> {
  await requirePermission("settings.update");

  const url = String(formData.get("webhookUrl") ?? "").trim() || null;
  const secret = String(formData.get("webhookSecret") ?? "").trim() || null;

  if (url && !/^https:\/\//i.test(url)) {
    return { error: "Webhook URL must start with https://" };
  }
  if (url && !secret) {
    return { error: "Add a secret so the webhook can reject stray requests." };
  }

  await saveSheetsConfig(url, secret);
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
