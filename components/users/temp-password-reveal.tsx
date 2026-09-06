"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-md border bg-background px-2 py-1.5 font-mono text-sm">
          {value}
        </code>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label={`Copy ${label}`}
          onClick={() => {
            void navigator.clipboard?.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? (
            <Check className="size-4 text-success" />
          ) : (
            <Copy className="size-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

export function TempPasswordReveal({
  email,
  tempPassword,
}: {
  email: string;
  tempPassword: string;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
        <CopyRow label="Email" value={email} />
        <CopyRow label="Temporary password" value={tempPassword} />
      </div>
      <p className="text-xs text-muted-foreground">
        Share these with the user. They&apos;ll be required to set their own
        password when they first sign in. This temporary password won&apos;t be
        shown again.
      </p>
    </div>
  );
}
