"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/auth";

export type LoginState = { error?: string } | undefined;

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const callbackUrl = (formData.get("callbackUrl") as string) || "/dashboard";

  try {
    await signIn("credentials", {
      username: formData.get("username"),
      password: formData.get("password"),
      redirectTo: callbackUrl,
    });
  } catch (error) {
    // NextAuth throws a redirect "error" on success — let it propagate.
    if (error instanceof AuthError) {
      return { error: "Invalid username or password." };
    }
    throw error;
  }

  return undefined;
}
