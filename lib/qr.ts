import "server-only";

import QRCode from "qrcode";

/**
 * The QR encodes the raw member token. The in-app scanner reads this text and
 * records attendance. Keeping it to just the token makes scanning work offline
 * and independent of the deployed URL.
 */
export async function generateQrDataUrl(token: string): Promise<string> {
  return QRCode.toDataURL(token, {
    margin: 1,
    width: 640,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
}

/**
 * Extract a member token from scanned QR text. Accepts either the raw token or
 * a URL that carries it as `?token=` (forward-compatible with URL-based codes).
 */
export function extractToken(scanned: string): string {
  const text = scanned.trim();
  try {
    const url = new URL(text);
    const t = url.searchParams.get("token");
    if (t) return t.trim();
  } catch {
    // not a URL — fall through
  }
  return text;
}
