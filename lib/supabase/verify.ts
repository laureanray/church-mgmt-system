import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Verifies access tokens without a round trip to the Auth server.
 *
 * `getUser()` is an HTTPS call to Supabase on *every* invocation, and this runs
 * on every request (proxy.ts) and again inside requireUser(). `getClaims()`
 * checks the token's signature against the project's published JWKS instead,
 * which is local work once the key set is cached.
 *
 * The key set is cached on the client instance, so it has to be a client that
 * outlives the request. The ones in server.ts cannot be: they are rebuilt per
 * request to carry that caller's cookies, which would refetch the JWKS every
 * time. Hence this second, session-less client, kept for the life of the
 * process and used only to verify.
 */
let verifier: SupabaseClient | undefined;
let warnedLegacySigning = false;

/**
 * Says so, once per process, when production tokens are still HS256.
 *
 * Nothing else would: the `getUser()` fallback is correct, so the only symptom
 * is every request quietly paying two HTTPS calls to Supabase Auth (one here in
 * proxy.ts, one in requireUser) instead of none. The header is read without
 * trusting it — it only decides whether to log.
 */
function warnIfLegacySigning(accessToken: string) {
  if (warnedLegacySigning || process.env.NODE_ENV !== "production") return;
  warnedLegacySigning = true;

  try {
    const header = JSON.parse(
      Buffer.from(accessToken.split(".")[0], "base64url").toString(),
    ) as { alg?: string };
    if (header.alg === "HS256") {
      console.warn(
        "[auth] Supabase is signing tokens with the legacy shared secret (HS256), " +
          "so every request verifies over HTTPS. Rotate to an asymmetric signing key " +
          "(Supabase dashboard → Project Settings → JWT Keys) to verify locally.",
      );
    }
  } catch {
    // A malformed token fails verification below; nothing to report here.
  }
}

function getVerifier(): SupabaseClient {
  // Built on first use, not at import: `next build` evaluates these modules to
  // collect page data, and preview deploys may have no Supabase env at all.
  verifier ??= createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  return verifier;
}

/**
 * The signed-in user's id, or null. Safe to gate access on.
 *
 * `getSession()` alone is not — it only decodes the cookie, which is trivially
 * forgeable. It is used here purely as the *source* of the access token (and to
 * refresh it when stale); the token is then cryptographically verified before
 * its subject is returned.
 *
 * If the project still signs tokens with the legacy shared secret rather than
 * an asymmetric signing key, `getClaims()` falls back internally to `getUser()`.
 * That is the same network call this replaces — never weaker, just not yet
 * faster. Migrating the project to asymmetric keys is what unlocks the win.
 */
export async function verifiedUserId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return null;

  warnIfLegacySigning(session.access_token);

  const { data, error } = await getVerifier().auth.getClaims(
    session.access_token,
  );

  if (error || !data) return null;

  return typeof data.claims.sub === "string" ? data.claims.sub : null;
}
