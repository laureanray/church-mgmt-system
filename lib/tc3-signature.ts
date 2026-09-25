import { createHash, createHmac } from "node:crypto";

// TC3-HMAC-SHA256, Tencent Cloud's request signature (their "API 3.0"
// signing scheme), for the one request shape this app sends: a JSON body
// POSTed to "/". Written out here rather than pulled in with Tencent's SDK,
// which is some 50 MB of old dependencies for the dozen lines below.
//
// Pure, so the unit suite checks it against vectors produced by the official
// SDK (lib/tc3-signature.test.ts).

export const TC3_ALGORITHM = "TC3-HMAC-SHA256";
export const TC3_CONTENT_TYPE = "application/json";
const SIGNED_HEADERS = "content-type;host";

export type Tc3Request = {
  secretId: string;
  secretKey: string;
  /** The product's short name, e.g. `iai`; also the host's first label. */
  service: string;
  host: string;
  /** The exact JSON text sent as the body — the signature covers its bytes. */
  body: string;
  /** Unix seconds. Tencent rejects a signature more than 5 minutes off. */
  timestamp: number;
};

const sha256Hex = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");

const hmac = (key: string | Buffer, text: string) =>
  createHmac("sha256", key).update(text, "utf8").digest();

/** The UTC calendar date of a Unix timestamp — the credential scope's day. */
function utcDate(timestamp: number) {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

/** The `Authorization` header value for a JSON POST to "/". */
export function tc3Authorization(request: Tc3Request): string {
  const { secretId, secretKey, service, host, body, timestamp } = request;

  const canonicalRequest = [
    "POST",
    "/",
    "",
    `content-type:${TC3_CONTENT_TYPE}\nhost:${host}\n`,
    SIGNED_HEADERS,
    sha256Hex(body),
  ].join("\n");

  const date = utcDate(timestamp);
  const scope = `${date}/${service}/tc3_request`;
  const stringToSign = [
    TC3_ALGORITHM,
    String(timestamp),
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = hmac(
    hmac(hmac(`TC3${secretKey}`, date), service),
    "tc3_request",
  );
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign, "utf8")
    .digest("hex");

  return `${TC3_ALGORITHM} Credential=${secretId}/${scope}, SignedHeaders=${SIGNED_HEADERS}, Signature=${signature}`;
}
