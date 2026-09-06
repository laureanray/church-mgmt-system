import { ShieldAlert } from "lucide-react";

import { SignOutButton } from "./sign-out-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Terminal page for an account that exists in Supabase Auth but has no profile
 * row, so it has no role.
 *
 * It must NOT call requireUser(): that is what sends people here, and proxy.ts
 * lets authenticated users through, so calling it would loop. Signing out is
 * the only way forward, and it runs client-side where the auth cookies can
 * actually be cleared.
 */
export default function NoAccessPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-destructive text-destructive-foreground">
            <ShieldAlert className="size-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            No access yet
          </h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              This account has no staff profile
            </CardTitle>
            <CardDescription>
              You signed in successfully, but the account is not set up as staff
              yet, so it has no role. Ask an administrator to add you under
              Staff Users, then sign in again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SignOutButton />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
