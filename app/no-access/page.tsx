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
 * Terminal page for an account without a staff profile or without the
 * permission required by the route it tried to open.
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
              This account does not have access
            </CardTitle>
            <CardDescription>
              You signed in successfully, but your staff role does not allow
              this page, or your account has not been set up as staff yet. Ask
              an administrator to review your role under Staff Users.
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
