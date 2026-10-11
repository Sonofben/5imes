import { randomBytes, timingSafeEqual, scryptSync } from "node:crypto";

/**
 * Recovery codes are 10 × 10-character base32 strings shown to the admin once,
 * stored only as scrypt hashes. Verifying consumes the row via the
 * `consume_recovery_code` RPC. We use scrypt from the Node std lib so we don't
 * add a native dependency (bcrypt would need a binary install step).
 */

const CODE_COUNT = 10;
const CODE_LENGTH = 10;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Crockford-like, no 1/I/0/O
const SCRYPT_N = 16384; // CPU/memory cost
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
const SCRYPT_SALT_LEN = 16;

export type RecoveryCodeBatch = { codes: string[]; hashes: string[] };

/** Generate a fresh batch of plaintext codes and their stored scrypt hashes. */
export function generateRecoveryCodes(): RecoveryCodeBatch {
  const codes: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < CODE_COUNT; i++) {
    const code = randomString(CODE_LENGTH);
    codes.push(formatCode(code));
    hashes.push(hashCode(normalise(code)));
  }
  return { codes, hashes };
}

/** Normalise a user-entered code: strip spaces/hyphens, uppercase. */
export function normalise(code: string) {
  return code.replace(/[\s-]+/g, "").toUpperCase();
}

/** Human-friendly `XXXXX-XXXXX` display grouping for a 10-char code. */
export function formatCode(code: string) {
  const c = normalise(code);
  return c.length === CODE_LENGTH ? `${c.slice(0, 5)}-${c.slice(5)}` : c;
}

export function hashCode(code: string): string {
  const salt = randomBytes(SCRYPT_SALT_LEN);
  const derived = scryptSync(code, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

/** Constant-time compare of a candidate plaintext against a stored hash. */
export function verifyCode(candidate: string, storedHash: string): boolean {
  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]), r = Number(parts[2]), p = Number(parts[3]);
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  let derived: Buffer;
  try {
    derived = scryptSync(normalise(candidate), salt, expected.length, { N, r, p });
  } catch {
    return false;
  }
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function randomString(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}
