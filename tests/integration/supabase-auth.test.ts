import { afterAll, beforeAll, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { createHmac } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { connectTestDatabase, resetTestDatabase } from "../support/database";
import {
  TEST_ANON_KEY,
  TEST_PASSWORD,
  TEST_SERVICE_ROLE_KEY,
  TEST_SUPABASE_URL,
  testAdminClient,
} from "../support/auth";
import { users } from "../../db/schema";

/*
 * The auth modules against the real GoTrue in compose.test.yml, rather than
 * mocks: a verifier is only worth testing against tokens a real Auth server
 * issued, and forged ones it did not. Only Next's request APIs (cookies,
 * redirect) are stood in for.
 */

// Read on first use by the modules below, so set before anything calls them.
process.env.NEXT_PUBLIC_SUPABASE_URL = TEST_SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = TEST_ANON_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY = TEST_SERVICE_ROLE_KEY;

/** The secret compose.test.yml gives GoTrue — a throwaway, as in the Supabase CLI. */
const TEST_JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";

type Cookie = { name: string; value: string; options?: unknown };
const jar = new Map<string, Cookie>();
let cookiesReadOnly = false;
await mock.module("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...jar.values()].map(({ name, value }) => ({ name, value })),
    set: (name: string, value: string, options?: unknown) => {
      if (cookiesReadOnly) throw new Error("Cookies can only be modified in a Server Action");
      if (value === "") jar.delete(name);
      else jar.set(name, { name, value, options });
    },
  }),
}));
await mock.module("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

const database = connectTestDatabase();
await mock.module("@/db", () => ({ db: database.db }));

const { verifyAccessToken, verifiedUserId } = await import("../../lib/supabase/verify");
const { createClient } = await import("../../lib/supabase/server");
const { createAdminClient } = await import("../../lib/supabase/admin");
const { signOutAction } = await import("../../lib/auth-actions");
const { hasAnyPermission, homeFor, requirePermission, requireUser } = await import(
  "../../lib/auth-helpers"
);

const EMAIL = "integration-auth@example.test";
let userId = "";
let accessToken = "";

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

/** An HS256 JWT, signed with `secret`. */
function signToken(payload: Record<string, unknown>, secret: string) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

async function removeTestUser() {
  const admin = testAdminClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const user of data?.users ?? []) {
    if (user.email === EMAIL) await admin.auth.admin.deleteUser(user.id);
  }
}

beforeAll(async () => {
  await removeTestUser();
  const { data, error } = await testAdminClient().auth.admin.createUser({
    email: EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("could not create the test user");
  userId = data.user.id;

  const anon = createSupabaseClient(TEST_SUPABASE_URL, TEST_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await anon.auth.signInWithPassword({ email: EMAIL, password: TEST_PASSWORD });
  if (signIn.error || !signIn.data.session) throw signIn.error ?? new Error("could not sign in");
  accessToken = signIn.data.session.access_token;
});

beforeEach(async () => {
  jar.clear();
  cookiesReadOnly = false;
  await resetTestDatabase(database.client);
});

afterAll(async () => {
  await removeTestUser();
  await database.client.end();
});

describe("verifyAccessToken", () => {
  // First, so the once-per-process warning has not been spent yet.
  it("warns once, in production, that tokens are still on the legacy shared secret", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const env = process.env as Record<string, string | undefined>;
    const previous = env.NODE_ENV;
    env.NODE_ENV = "production";
    let calls: unknown[][];
    try {
      await verifyAccessToken(accessToken);
      await verifyAccessToken(accessToken);
      // Read before restoring: restoring the spy clears what it recorded.
      calls = [...warn.mock.calls];
    } finally {
      env.NODE_ENV = previous;
      warn.mockRestore();
    }
    expect(calls).toHaveLength(1);
    expect(String(calls[0][0])).toContain("legacy shared secret (HS256)");
  });

  it("returns the subject of a token the Auth server issued", async () => {
    expect(await verifyAccessToken(accessToken)).toBe(userId);
  });

  it("refuses a token whose payload was changed after signing", async () => {
    const [header, , signature] = accessToken.split(".");
    const claims = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString());
    const forged = base64url(JSON.stringify({ ...claims, sub: "someone-else" }));
    expect(await verifyAccessToken(`${header}.${forged}.${signature}`)).toBeNull();
  });

  it("refuses a well-formed token signed with another secret", async () => {
    const token = signToken(
      { sub: userId, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 600 },
      "not-the-real-secret-not-the-real-secret",
    );
    expect(await verifyAccessToken(token)).toBeNull();
  });

  it("refuses an expired token, even one signed with the real secret", async () => {
    const token = signToken(
      { sub: userId, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) - 60 },
      TEST_JWT_SECRET,
    );
    expect(await verifyAccessToken(token)).toBeNull();
  });

  it("refuses something that is not a token at all", async () => {
    expect(await verifyAccessToken("not-a-jwt")).toBeNull();
  });
});

describe("the cookie session (lib/supabase/server.ts)", () => {
  it("has nobody signed in without session cookies", async () => {
    expect(await verifiedUserId(await createClient())).toBeNull();
  });

  it("writes the session to cookies on sign-in, and verifies it on the next request", async () => {
    const signIn = await (await createClient()).auth.signInWithPassword({
      email: EMAIL,
      password: TEST_PASSWORD,
    });
    expect(signIn.error).toBeNull();
    expect(jar.size).toBeGreaterThan(0);

    // A fresh client, as the next request would build, reading those cookies.
    expect(await verifiedUserId(await createClient())).toBe(userId);
  });

  it("tolerates a server component, where cookies cannot be written", async () => {
    cookiesReadOnly = true;
    const signIn = await (await createClient()).auth.signInWithPassword({
      email: EMAIL,
      password: TEST_PASSWORD,
    });
    expect(signIn.error).toBeNull();
    expect(jar.size).toBe(0);
  });

  it("signs out, clearing the session, and sends the user to /login", async () => {
    await (await createClient()).auth.signInWithPassword({ email: EMAIL, password: TEST_PASSWORD });
    await expect(signOutAction()).rejects.toThrow("redirect:/login");
    expect(await verifiedUserId(await createClient())).toBeNull();
  });
});

describe("requireUser and requirePermission, signed in for real", () => {
  async function signIn(roleId: string) {
    await database.db
      .insert(users)
      .values({ id: userId, email: EMAIL, name: "Integration User", roleId });
    await (await createClient()).auth.signInWithPassword({ email: EMAIL, password: TEST_PASSWORD });
  }

  it("returns the profile when the role grants the permission", async () => {
    await signIn("usher");
    expect(await requireUser()).toMatchObject({ id: userId, role: { id: "usher" } });
    expect(await requirePermission("attendance.record")).toMatchObject({ id: userId });
  });

  it("sends someone without the permission to /no-access", async () => {
    await signIn("usher");
    await expect(requirePermission("users.delete")).rejects.toThrow("redirect:/no-access");
  });
});

describe("permission helpers", () => {
  const usher = { permissions: ["attendance.record", "dashboard.view"] as const, ministries: [] };

  it("hasAnyPermission is true when one of several is held", () => {
    expect(hasAnyPermission({ permissions: [...usher.permissions] }, ["users.view", "attendance.record"])).toBe(true);
    expect(hasAnyPermission({ permissions: [...usher.permissions] }, ["users.view", "roles.view"])).toBe(false);
  });

  it("homeFor sends someone to the first page they may open, or to /no-access", () => {
    expect(homeFor({ permissions: [...usher.permissions], ministries: [] })).toBe("/dashboard");
    expect(homeFor({ permissions: [], ministries: [] })).toBe("/no-access");
  });
});

describe("createAdminClient", () => {
  it("refuses to build without the service-role key", () => {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      expect(() => createAdminClient()).toThrow("SUPABASE_SERVICE_ROLE_KEY is not set");
    } finally {
      process.env.SUPABASE_SERVICE_ROLE_KEY = key;
    }
  });

  it("reaches the Auth admin API with it", async () => {
    const { data, error } = await createAdminClient().auth.admin.getUserById(userId);
    expect(error).toBeNull();
    expect(data.user?.email).toBe(EMAIL);
  });
});
