"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/**
 * Signs out in the browser. The server-side helper cannot be used here: a
 * server component is unable to clear the auth cookies, which is precisely
 * what has to happen to escape this page.
 */
export function SignOutButton() {
  const [pending, setPending] = useState(false);

  return (
    <Button
      className="w-full"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await createClient().auth.signOut();
        // Full reload so proxy.ts re-evaluates without the session cookie.
        window.location.href = "/login";
      }}
    >
      <LogOut className="size-4" />
      {pending ? "Signing out..." : "Sign out"}
    </Button>
  );
}
