import Link from "next/link";
import { CheckCircle2, ExternalLink, History, Sheet } from "lucide-react";

import { hasPermission, requirePermission } from "@/lib/auth-helpers";
import { getSettings, saveSheetsConfig } from "@/lib/sheets";
import { CodeBlock } from "@/components/integrations/code-block";
import { SheetsSettingsForm } from "@/components/integrations/sheets-settings-form";
import { SyncAllButton } from "@/components/integrations/sync-buttons";
import { PageContainer } from "@/components/patterns/page-container";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function appsScript(secret: string) {
  return `// IRM Ministries — Attendance sync endpoint
// Paste this into your Google Sheet: Extensions ▸ Apps Script.
// Then Deploy ▸ New deployment ▸ Web app:
//   Execute as: Me   |   Who has access: Anyone
// Copy the Web app URL into Settings, then Test connection.

const SECRET = '${secret}';
const SHEET_NAME = 'Attendance';
const HEADERS = ['ID', 'Timestamp', 'Service', 'Service Date', 'Member', 'Recorded By'];

function doPost(e) {
  const out = (o) => ContentService
    .createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return out({ ok: false, error: 'unauthorized' });
    if (body.ping) return out({ ok: true });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);

    const seen = {};
    const last = sheet.getLastRow();
    if (last > 1) {
      const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) seen[ids[i][0]] = true;
    }

    let synced = 0;
    const rows = body.rows || [];
    for (let j = 0; j < rows.length; j++) {
      const r = rows[j];
      if (seen[r.id]) continue; // dedupe by attendance ID
      sheet.appendRow([r.id, r.timestamp, r.service, r.serviceDate, r.member, r.recordedBy]);
      seen[r.id] = true;
      synced++;
    }
    return out({ ok: true, synced: synced });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}`;
}

export default async function SettingsPage() {
  const user = await requirePermission("settings.view");

  // Ensure a stable secret exists so the snippet and form always match.
  let settings = await getSettings();
  if (!settings?.sheetsWebhookSecret) {
    const secret = crypto.randomUUID().replace(/-/g, "");
    await saveSheetsConfig(settings?.sheetsWebhookUrl ?? null, secret);
    settings = await getSettings();
  }

  const url = settings?.sheetsWebhookUrl ?? "";
  const secret = settings?.sheetsWebhookSecret ?? "";
  const connected = Boolean(url && secret);

  return (
    <PageContainer width="form">
      <PageHeader
        title="Settings"
        description="Connect external services to your church system."
      >
        {hasPermission(user, "audit.view") ? (
          <Link
            href="/settings/audit"
            className={buttonVariants({ variant: "outline" })}
          >
            <History className="size-4" />
            Audit log
          </Link>
        ) : null}
      </PageHeader>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-md bg-success/10">
                <Sheet className="size-5 text-success" />
              </div>
              <div>
                <CardTitle className="text-base">Google Sheets</CardTitle>
                <CardDescription>
                  Push attendance to a spreadsheet you control.
                </CardDescription>
              </div>
            </div>
            {connected ? (
              <Badge variant="success" className="gap-1">
                <CheckCircle2 className="size-3.5" />
                Connected
              </Badge>
            ) : (
              <Badge variant="outline">Not connected</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <SheetsSettingsForm
            defaultUrl={url}
            defaultSecret={secret}
            connected={connected}
          />

          {connected ? (
            <div className="border-t pt-4">
              <p className="mb-2 text-sm font-medium">Sync now</p>
              <p className="mb-3 text-sm text-muted-foreground">
                Pushes every attendance record. Re-syncing is safe — rows are
                de-duplicated by ID, so nothing is doubled.
              </p>
              <SyncAllButton />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Setup (one time)</CardTitle>
          <CardDescription>
            No Google Cloud account needed — just your spreadsheet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>
              Open (or create) a Google Sheet. Go to{" "}
              <strong>Extensions ▸ Apps Script</strong>.
            </li>
            <li>Delete any code there and paste the script below.</li>
            <li>
              Click <strong>Deploy ▸ New deployment ▸ Web app</strong>. Set{" "}
              <em>Execute as: Me</em> and <em>Who has access: Anyone</em>, then
              Deploy and authorize.
            </li>
            <li>
              Copy the <strong>Web app URL</strong> it gives you into the field
              above, then <strong>Save</strong> and <strong>Test connection</strong>.
            </li>
          </ol>

          <CodeBlock code={appsScript(secret)} />

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ExternalLink className="size-3.5" />
            The script already contains your secret, so it&apos;s ready to paste.
          </p>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
