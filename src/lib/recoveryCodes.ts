import { randomBytes } from "node:crypto";

/**
 * Plaintext recovery codes are generated here and handed to the DB, which
 * stores only bcrypt hashes (via pgcrypto `crypt()`) and does all
 * verification server-side. The plaintext is shown to the user once and
 * never leaves this process otherwise.
 *
 * Format: 10 codes, 10 characters each from a Crockford-like alphabet (no
 * confusing 0/O/1/I/L), displayed as `XXXXX-XXXXX` for easy reading.
 */

const CODE_COUNT = 10;
const CODE_LENGTH = 10;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type RecoveryCodeBatch = { codes: string[] };

/** Generate a fresh batch of plaintext codes for display. */
export function generateRecoveryCodes(): RecoveryCodeBatch {
  const codes: string[] = [];
  for (let i = 0; i < CODE_COUNT; i++) codes.push(formatCode(randomString(CODE_LENGTH)));
  return { codes };
}

/** Normalise a user-entered code: strip spaces/hyphens, uppercase. */
export function normalise(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** Human-friendly `XXXXX-XXXXX` display grouping for a 10-char code. */
export function formatCode(code: string): string {
  const c = normalise(code);
  return c.length === CODE_LENGTH ? `${c.slice(0, 5)}-${c.slice(5)}` : c;
}

function randomString(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}
