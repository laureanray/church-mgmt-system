import { afterAll, beforeEach, expect, it, mock } from "bun:test";
import { eq } from "drizzle-orm";

import { connectTestDatabase, resetTestDatabase } from "../support/database";
import { members, users } from "../../db/schema";

/*
 * The HTTP adapter end to end, short of a real Supabase: bearer token →
 * profile and role from Postgres → service → JSON. Only the signature check is
 * stubbed, mapping each fake token straight to a user id.
 */
const database = connectTestDatabase();
const TOKENS: Record<string, string> = {
  "admin-token": "admin-user",
  "usher-token": "usher-user",
  "temporary-token": "temporary-user",
  "orphan-token": "no-profile",
};
await mock.module("@/db", () => ({ db: database.db }));
await mock.module("@/lib/supabase/verify", () => ({
  verifiedUserId: mock(),
  verifyAccessToken: async (token: string) => {
    if (token === "outage-token") throw new Error("JWKS fetch failed");
    return TOKENS[token] ?? null;
  },
}));
const collection = await import("../../app/api/v1/members/route");
const item = await import("../../app/api/v1/members/[id]/route");
const reactivate = await import(
  "../../app/api/v1/members/[id]/reactivate/route"
);

const BASE = "http://localhost/api/v1/members";

function request(token: string | null, path = "", init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.body) headers.set("content-type", "application/json");
  return new Request(`${BASE}${path}`, { ...init, headers });
}

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(async () => {
  await resetTestDatabase(database.client);
  await database.db.insert(users).values([
    { id: "admin-user", email: "admin@example.test", name: "Admin", roleId: "admin" },
    { id: "usher-user", email: "usher@example.test", name: "Usher", roleId: "usher" },
    {
      id: "temporary-user",
      email: "temporary@example.test",
      name: "Temporary",
      roleId: "admin",
      mustChangePassword: true,
    },
  ]);
  await database.db.insert(members).values([
    { id: "ana", fullName: "Ana Santos", qrToken: "ana-token", gender: "female" },
    { id: "ben", fullName: "Ben Cruz", qrToken: "ben-token", status: "inactive" },
    { id: "cora", fullName: "Cora Reyes", qrToken: "cora-token", status: "transferred" },
  ]);
});
afterAll(() => database.client.end());

it("refuses a request without a valid bearer token", async () => {
  for (const token of [null, "forged-token", "orphan-token"]) {
    const response = await collection.GET(request(token), undefined);
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("unauthenticated");
  }
});

it("answers an authentication outage with the documented 500 body", async () => {
  const logged = mock();
  const original = console.error;
  console.error = logged;
  try {
    const response = await collection.GET(request("outage-token"), undefined);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "internal", message: "Something went wrong." },
    });
    expect(logged).toHaveBeenCalled();
  } finally {
    console.error = original;
  }
});

it("holds a temporary password out of the API as the web app does", async () => {
  const response = await collection.GET(request("temporary-token"), undefined);
  expect(response.status).toBe(403);
  expect((await response.json()).error.code).toBe("password_change_required");
});

it("lists the directory view by default, the same as /members", async () => {
  const response = await collection.GET(request("usher-token"), undefined);
  expect(response.status).toBe(200);
  const body = await response.json();
  // Inactive and transferred members are on record but outside the default view.
  expect(body.rows.map((m: { id: string }) => m.id)).toEqual(["ana"]);
  expect(body).toMatchObject({ matching: 1, total: 3, page: 1, perPage: 20 });
});

it("filters, sorts and pages from query params", async () => {
  const response = await collection.GET(
    request("usher-token", "?status=all&sort=name&direction=desc&perPage=2"),
    undefined,
  );
  const body = await response.json();
  expect(body.rows.map((m: { id: string }) => m.id)).toEqual(["cora", "ben"]);
  expect(body.matching).toBe(3);

  const filtered = await collection.GET(
    request("usher-token", "?status=active,inactive&gender=female"),
    undefined,
  );
  expect((await filtered.json()).rows.map((m: { id: string }) => m.id)).toEqual(["ana"]);
});

it("rejects a sort key outside the whitelist", async () => {
  const response = await collection.GET(
    request("usher-token", "?sort=qrToken"),
    undefined,
  );
  expect(response.status).toBe(422);
  expect((await response.json()).error.fields).toHaveProperty("sort");
});

it("enforces permissions inside the service", async () => {
  const response = await collection.POST(
    request("usher-token", "", {
      method: "POST",
      body: JSON.stringify({ firstName: "Dan", lastName: "Lim" }),
    }),
    undefined,
  );
  expect(response.status).toBe(403);
  expect(await database.db.$count(members)).toBe(3);
});

it("creates, reads, replaces and deletes a member", async () => {
  const created = await collection.POST(
    request("admin-token", "", {
      method: "POST",
      body: JSON.stringify({ firstName: "Dan", lastName: "Lim", memberSinceYear: 2020 }),
    }),
    undefined,
  );
  expect(created.status).toBe(201);
  const member = await created.json();
  expect(member).toMatchObject({ fullName: "Dan Lim", status: "active", memberSinceYear: 2020 });
  expect(created.headers.get("location")).toBe(`/api/v1/members/${member.id}`);

  const read = await item.GET(request("admin-token", `/${member.id}`), context(member.id));
  expect((await read.json()).fullName).toBe("Dan Lim");

  const replaced = await item.PUT(
    request("admin-token", `/${member.id}`, {
      method: "PUT",
      body: JSON.stringify({ firstName: "Daniel", lastName: "Lim", status: "visitor" }),
    }),
    context(member.id),
  );
  expect(await replaced.json()).toMatchObject({ fullName: "Daniel Lim", status: "visitor" });

  const deleted = await item.DELETE(
    request("admin-token", `/${member.id}`, { method: "DELETE" }),
    context(member.id),
  );
  expect(deleted.status).toBe(204);

  const gone = await item.GET(request("admin-token", `/${member.id}`), context(member.id));
  expect(gone.status).toBe(404);
});

it("reports validation errors per field, as the web form does", async () => {
  const response = await collection.POST(
    request("admin-token", "", {
      method: "POST",
      body: JSON.stringify({ firstName: "", lastName: "Lim", gender: "other" }),
    }),
    undefined,
  );
  expect(response.status).toBe(422);
  const { error } = await response.json();
  expect(error.code).toBe("invalid");
  expect(error.fields).toMatchObject({
    firstName: "First name is required",
    gender: expect.any(String),
  });

  const malformed = await collection.POST(
    request("admin-token", "", { method: "POST", body: "not json" }),
    undefined,
  );
  expect(malformed.status).toBe(422);
});

it("reactivates only a lapsed member", async () => {
  const response = await reactivate.POST(
    request("admin-token", "/ben/reactivate", { method: "POST" }),
    context("ben"),
  );
  expect(response.status).toBe(200);
  const [ben] = await database.db.select().from(members).where(eq(members.id, "ben"));
  expect(ben.status).toBe("active");

  const again = await reactivate.POST(
    request("admin-token", "/ben/reactivate", { method: "POST" }),
    context("ben"),
  );
  expect(again.status).toBe(409);
});
