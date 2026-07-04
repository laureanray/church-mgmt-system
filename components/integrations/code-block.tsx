"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

export function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="relative">
      <Button
        type="button"
        size="icon-sm"
        variant="secondary"
        className="absolute top-2 right-2 z-10"
        aria-label="Copy code"
        onClick={() => {
          void navigator.clipboard?.writeText(code);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? (
          <Check className="size-4 text-emerald-600" />
        ) : (
          <Copy className="size-4" />
        )}
      </Button>
      <pre className="max-h-80 overflow-auto rounded-lg border bg-muted/50 p-3 text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
