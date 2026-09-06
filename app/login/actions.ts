"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string } | undefined;

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const callbackUrl = (formData.get("callbackUrl") as string) || "/dashboard";
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Deliberately vague: distinguishing "no such account" from "wrong
    // password" would let anyone probe which staff emails exist.
    return { error: "Invalid email or password." };
  }

  redirect(safeCallbackUrl(callbackUrl));
}

/**
 * Restricts a `?callbackUrl=` to a path inside this app.
 *
 * A bare `startsWith("/")` is not enough: browsers read `//evil.example` as
 * protocol-relative and `/\evil.example` likewise, so either would send a
 * freshly authenticated staff member off-site. Require exactly one leading
 * slash, and reject anything the URL parser resolves to another origin.
 */
function safeCallbackUrl(candidate: string): string {
  const fallback = "/dashboard";
  if (!candidate.startsWith("/")) return fallback;
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) return fallback;

  // Resolve against an arbitrary origin; anything that escapes it is not a path.
  try {
    const base = "http://callback.invalid";
    const resolved = new URL(candidate, base);
    if (resolved.origin !== base) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}
