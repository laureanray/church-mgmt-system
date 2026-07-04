"use client";

import Image from "next/image";
import { Download, Printer } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MemberQr({
  dataUrl,
  name,
  token,
}: {
  dataUrl: string;
  name: string;
  token: string;
}) {
  function handlePrint() {
    const w = window.open("", "_blank", "width=420,height=600");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${name} — QR</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: ui-sans-serif, system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
        .card { border: 1px solid #e5e5e5; border-radius: 16px; padding: 28px; text-align: center; width: 320px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        p { color: #666; font-size: 12px; margin-bottom: 16px; }
        img { width: 260px; height: 260px; }
        code { display: block; margin-top: 12px; font-size: 11px; color: #999; letter-spacing: 1px; }
      </style></head>
      <body>
        <div class="card">
          <h1>${name}</h1>
          <p>Attendance QR Code</p>
          <img src="${dataUrl}" alt="QR code" />
          <code>${token}</code>
        </div>
        <script>window.onload = function(){ window.print(); }</script>
      </body></html>`);
    w.document.close();
  }

  return (
    <div className="flex flex-col items-center">
      <div className="rounded-xl border bg-white p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <Image
          src={dataUrl}
          alt={`QR code for ${name}`}
          width={200}
          height={200}
          unoptimized
          className="size-44"
        />
      </div>
      <code className="mt-2 text-[11px] tracking-widest text-muted-foreground">
        {token}
      </code>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="outline" onClick={handlePrint}>
          <Printer className="size-4" />
          Print
        </Button>
        <a
          href={dataUrl}
          download={`${name.replace(/\s+/g, "-")}-qr.png`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <Download className="size-4" />
          Download
        </a>
      </div>
    </div>
  );
}
