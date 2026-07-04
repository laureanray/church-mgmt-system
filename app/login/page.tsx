import { Church } from "lucide-react";

import { LoginForm } from "./login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Church className="size-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            IRM Ministries
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in to manage members and attendance
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>
              Enter your staff credentials to continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm callbackUrl={callbackUrl} />
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Demo login: admin@church.local / admin123
        </p>
      </div>
    </div>
  );
}
