import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { verifiedUserId } from "@/lib/supabase/verify";

/**
 * Refreshes the Supabase session on every request and gates the app behind it.
 *
 * The response object matters: Supabase may rotate the auth cookies while
 * reading the user, and those Set-Cookie headers have to ride back on the
 * response we actually return, or the session silently expires.
 *
 * This only checks that a session exists. Role enforcement stays per-route in
 * lib/auth-helpers.ts.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Verifies the token's signature rather than trusting the cookie. This used
  // to be getUser(), an HTTPS call to Supabase on every single request — which,
  // with this matcher, includes each of Next's route prefetches.
  const userId = await verifiedUserId(supabase);

  const { pathname } = request.nextUrl;
  const isOnLogin = pathname === "/login";

  if (isOnLogin) {
    if (userId) {
      return NextResponse.redirect(new URL("/dashboard", request.nextUrl));
    }
    return response;
  }

  if (!userId) {
    const loginUrl = new URL("/login", request.nextUrl);
    if (pathname !== "/") {
      loginUrl.searchParams.set("callbackUrl", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  // Run on all routes except Next internals and static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
