import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { appSettings, attendance } from "@/db/schema";

const SETTINGS_ID = "singleton";

export const SHEET_HEADERS = [
  "ID",
  "Timestamp",
  "Service",
  "Service Date",
  "Member",
  "Recorded By",
] as const;

export type SheetsConfig = { url: string; secret: string };

export async function getSettings() {
  return db.query.appSettings.findFirst({
    where: eq(appSettings.id, SETTINGS_ID),
  });
}

export async function saveSheetsConfig(
  url: string | null,
  secret: string | null,
) {
  await db
    .insert(appSettings)
    .values({
      id: SETTINGS_ID,
      sheetsWebhookUrl: url,
      sheetsWebhookSecret: secret,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: {
        sheetsWebhookUrl: url,
        sheetsWebhookSecret: secret,
        updatedAt: new Date(),
      },
    });
}

export async function getSheetsConfig(): Promise<SheetsConfig | null> {
  const s = await getSettings();
  if (s?.sheetsWebhookUrl && s.sheetsWebhookSecret) {
    return { url: s.sheetsWebhookUrl, secret: s.sheetsWebhookSecret };
  }
  return null;
}

export type AttendanceRow = {
  id: string;
  timestamp: string;
  service: string;
  serviceDate: string;
  member: string;
  recordedBy: string;
};

export type SyncResult = { ok: boolean; synced?: number; error?: string };

const pad = (n: number) => String(n).padStart(2, "0");
const fmtTimestamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

async function postToWebhook(
  config: SheetsConfig,
  payload: Record<string, unknown>,
): Promise<SyncResult> {
  try {
    const res = await fetch(config.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: config.secret, ...payload }),
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return { ok: false, error: `Google Sheets responded with HTTP ${res.status}` };
    }
    const text = await res.text();
    let data: { ok?: boolean; synced?: number; error?: string } = {};
    try {
      data = JSON.parse(text);
    } catch {
      // Non-JSON response — treat a 200 as success.
    }
    if (data.ok === false) {
      return {
        ok: false,
        error: data.error || "The webhook rejected the request (check the secret).",
      };
    }
    return { ok: true, synced: data.synced };
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.name === "TimeoutError"
          ? "The webhook timed out. Is the URL correct and deployed?"
          : e.message
        : "Request failed";
    return { ok: false, error: msg };
  }
}

/** Push attendance rows to the configured Google Sheet (idempotent by ID). */
export async function pushRows(rows: AttendanceRow[]): Promise<SyncResult> {
  const config = await getSheetsConfig();
  if (!config) return { ok: false, error: "Google Sheets isn't configured yet." };
  if (rows.length === 0) return { ok: true, synced: 0 };
  return postToWebhook(config, { rows });
}

/** Send a lightweight ping to verify the webhook URL + secret. */
export async function pingSheets(): Promise<SyncResult> {
  const config = await getSheetsConfig();
  if (!config) return { ok: false, error: "Google Sheets isn't configured yet." };
  return postToWebhook(config, { ping: true });
}

export async function buildRowsForService(
  serviceId: string,
): Promise<AttendanceRow[]> {
  const rows = await db.query.attendance.findMany({
    where: eq(attendance.serviceId, serviceId),
    with: { member: true, service: true, recordedByUser: true },
  });
  return rows.map((a) => ({
    id: a.id,
    timestamp: fmtTimestamp(new Date(a.checkedInAt)),
    service: a.service?.name ?? "",
    serviceDate: a.service ? fmtDate(new Date(a.service.scheduledAt)) : "",
    member: a.member?.fullName ?? "",
    recordedBy: a.recordedByUser?.name ?? "",
  }));
}

export async function buildAllRows(): Promise<AttendanceRow[]> {
  const rows = await db.query.attendance.findMany({
    with: { member: true, service: true, recordedByUser: true },
  });
  return rows.map((a) => ({
    id: a.id,
    timestamp: fmtTimestamp(new Date(a.checkedInAt)),
    service: a.service?.name ?? "",
    serviceDate: a.service ? fmtDate(new Date(a.service.scheduledAt)) : "",
    member: a.member?.fullName ?? "",
    recordedBy: a.recordedByUser?.name ?? "",
  }));
}
