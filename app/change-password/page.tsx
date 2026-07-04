import Link from "next/link";
import { eq } from "drizzle-orm";
import { KeyRound } from "lucide-react";

import { ChangePasswordForm } from "./change-password-form";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth-helpers";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function ChangePasswordPage() {
  const sessionUser = await requireUser();
  const user = await db.query.users.findFirst({
    where: eq(users.id, sessionUser.id),
    columns: { mustChangePassword: true },
  });
  const forced = user?.mustChangePassword ?? false;

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <KeyRound className="size-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            {forced ? "Set a new password" : "Change password"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {forced
              ? "You're signed in with a temporary password. Choose a new one to continue."
              : "Update your account password."}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>New password</CardTitle>
            <CardDescription>
              Pick something only you know.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>

        {!forced ? (
          <p className="mt-4 text-center text-sm">
            <Link
              href="/dashboard"
              className="text-muted-foreground hover:text-foreground hover:underline"
            >
              Back to dashboard
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
