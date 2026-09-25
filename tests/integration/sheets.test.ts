import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import { connectTestDatabase, resetTestDatabase } from "../support/database";
import { appSettings, attendance, members, services, users } from "../../db/schema";

/*
 * The Google Sheets export: rows read from the real test database, sent to a
 * stand-in for the Apps Script webhook. What the webhook answers — and how it
 * fails — is the part worth pinning down; the church relies on the message.
 */
const database = connectTestDatabase();
await mock.module("@/db", () => ({ db: database.db }));
const { buildAllRows, buildRowsForService, getSheetsConfig, pingSheets, pushRows, saveSheetsConfig } =
  await import("../../lib/sheets");

const realFetch = globalThis.fetch;
let sent: { url: string; body: Record<string, unknown> }[] = [];

function webhook(respond: () => Response | Promise<Response>) {
  globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return respond();
  }) as unknown as typeof fetch;
}

const URL_ = "https://script.google.com/macros/s/test/exec";

beforeEach(async () => {
  await resetTestDatabase(database.client);
  sent = [];
});
afterEach(() => {
  globalThis.fetch = realFetch;
});
afterAll(() => database.client.end());

async function configure() {
  await saveSheetsConfig(URL_, "s3cret");
}

async function seedCheckIn() {
  await database.db.insert(users).values({ id: "usher", email: "usher@example.test", name: "Usher Uno" });
  await database.db.insert(members).values({ id: "ana", fullName: "Ana Santos", qrToken: "t" });
  // Sunday 27 September 2026, 9 AM in Manila.
  await database.db
    .insert(services)
    .values({ id: "sunday", name: "Sunday Worship", scheduledAt: new Date("2026-09-27T01:00:00Z") });
  // Checked in at 7:30:15 AM Manila time — still Saturday in UTC.
  await database.db.insert(attendance).values({
    id: "att-1",
    memberId: "ana",
    serviceId: "sunday",
    recordedBy: "usher",
    checkedInAt: new Date("2026-09-26T23:30:15Z"),
  });
}

describe("configuration", () => {
  it("is absent until both the URL and the secret are saved", async () => {
    expect(await getSheetsConfig()).toBeNull();
    await saveSheetsConfig(URL_, null);
    expect(await getSheetsConfig()).toBeNull();
    await configure();
    expect(await getSheetsConfig()).toEqual({ url: URL_, secret: "s3cret" });
    expect(await database.db.select().from(appSettings)).toHaveLength(1);
  });

  it("says so rather than calling out when not configured", async () => {
    webhook(() => Response.json({ ok: true }));
    expect(await pingSheets()).toEqual({ ok: false, error: "Google Sheets isn't configured yet." });
    expect(await pushRows([])).toEqual({ ok: false, error: "Google Sheets isn't configured yet." });
    expect(sent).toHaveLength(0);
  });
});

describe("rows", () => {
  it("are written in church time, whatever zone the server is in", async () => {
    await seedCheckIn();
    const expected = [
      {
        id: "att-1",
        timestamp: "2026-09-27 07:30:15",
        service: "Sunday Worship",
        serviceDate: "2026-09-27",
        member: "Ana Santos",
        recordedBy: "Usher Uno",
      },
    ];
    expect(await buildRowsForService("sunday")).toEqual(expected);
    expect(await buildAllRows()).toEqual(expected);
    expect(await buildRowsForService("another")).toEqual([]);
  });
});

describe("the webhook", () => {
  it("receives the secret with the rows, and reports how many it synced", async () => {
    await configure();
    webhook(() => Response.json({ ok: true, synced: 1 }));
    const rows = [{ id: "a", timestamp: "", service: "", serviceDate: "", member: "", recordedBy: "" }];
    expect(await pushRows(rows)).toEqual({ ok: true, synced: 1 });
    expect(sent[0]).toEqual({ url: URL_, body: { secret: "s3cret", rows } });
  });

  it("is not called for nothing to send", async () => {
    await configure();
    webhook(() => Response.json({ ok: true }));
    expect(await pushRows([])).toEqual({ ok: true, synced: 0 });
    expect(sent).toHaveLength(0);
  });

  it("pings with the secret to test the connection", async () => {
    await configure();
    webhook(() => Response.json({ ok: true }));
    expect(await pingSheets()).toEqual({ ok: true, synced: undefined });
    expect(sent[0].body).toEqual({ secret: "s3cret", ping: true });
  });

  it("treats a 200 that is not JSON as success", async () => {
    await configure();
    webhook(() => new Response("<html>OK</html>"));
    expect(await pingSheets()).toEqual({ ok: true, synced: undefined });
  });

  it("passes on the script's own refusal, or a default one", async () => {
    await configure();
    webhook(() => Response.json({ ok: false, error: "unauthorized" }));
    expect(await pingSheets()).toEqual({ ok: false, error: "unauthorized" });
    webhook(() => Response.json({ ok: false }));
    expect(await pingSheets()).toEqual({
      ok: false,
      error: "The webhook rejected the request (check the secret).",
    });
  });

  it("reports an HTTP error status", async () => {
    await configure();
    webhook(() => new Response("nope", { status: 404 }));
    expect(await pingSheets()).toEqual({ ok: false, error: "Google Sheets responded with HTTP 404" });
  });

  it("explains a timeout, and passes on other network errors", async () => {
    await configure();
    webhook(() => {
      throw new DOMException("timed out", "TimeoutError");
    });
    expect(await pingSheets()).toEqual({
      ok: false,
      error: "The webhook timed out. Is the URL correct and deployed?",
    });
    webhook(() => {
      throw new TypeError("getaddrinfo ENOTFOUND script.google.com");
    });
    expect(await pingSheets()).toEqual({ ok: false, error: "getaddrinfo ENOTFOUND script.google.com" });
    webhook(() => {
      throw "bare string";
    });
    expect(await pingSheets()).toEqual({ ok: false, error: "Request failed" });
  });
});
