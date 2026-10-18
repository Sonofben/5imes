import { createHmac, timingSafeEqual } from "node:crypto";

/** Monnify webhook check: header `monnify-signature` must equal HMAC-SHA512(secretKey, raw body) in hex. */
export function signatureMatches(rawBody: string, signature: string | null | undefined, secret: string | undefined) {
  if (!signature || !secret) return false;
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(signature.trim().toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}
