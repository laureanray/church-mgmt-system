"use client";

import Image from "next/image";
import { Download, Printer } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PRINT_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
  .card { border: 1px solid #e5e5e5; border-radius: 16px; padding: 28px; text-align: center; width: 320px; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  p { color: #666; font-size: 12px; margin-bottom: 16px; }
  img { width: 260px; height: 260px; }
  code { display: block; margin-top: 12px; font-size: 11px; color: #999; letter-spacing: 1px; }
`;

/**
 * Fill the print popup with DOM nodes rather than an HTML string. The popup is
 * `about:blank`, which shares this page's origin, so a member name written in
 * as markup would run as script with the signed-in user's session. Every value
 * here goes in as text or as a property, never parsed as HTML.
 */
export function writePrintDocument(
  doc: Document,
  { dataUrl, name, token }: { dataUrl: string; name: string; token: string },
  onReady: () => void,
) {
  const style = doc.createElement("style");
  style.textContent = PRINT_STYLES;
  doc.head.replaceChildren(style);
  // After the head is replaced: setting a title creates a <title> element there.
  doc.title = `${name} — QR`;

  const heading = doc.createElement("h1");
  heading.textContent = name;

  const caption = doc.createElement("p");
  caption.textContent = "Attendance QR Code";

  const image = doc.createElement("img");
  image.alt = "QR code";
  // Print once the image has decoded, or the page prints without it.
  image.addEventListener("load", onReady, { once: true });
  image.src = dataUrl;

  const code = doc.createElement("code");
  code.textContent = token;

  const card = doc.createElement("div");
  card.className = "card";
  card.append(heading, caption, image, code);
  doc.body.replaceChildren(card);
}

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
    writePrintDocument(w.document, { dataUrl, name, token }, () => w.print());
  }

  return (
    <div className="flex flex-col items-center">
      <div className="rounded-xl border bg-white p-3">
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
