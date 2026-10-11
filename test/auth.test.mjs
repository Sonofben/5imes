import test from "node:test";
import assert from "node:assert/strict";
import { generateRecoveryCodes, hashCode, verifyCode, normalise, formatCode } from "../src/lib/recoveryCodes.ts";
import { passwordIssues, MIN_PASSWORD_LENGTH } from "../src/lib/password.ts";

test("generateRecoveryCodes produces ten unique codes with matching hashes", () => {
  const batch = generateRecoveryCodes();
  assert.equal(batch.codes.length, 10);
  assert.equal(batch.hashes.length, 10);
  const unique = new Set(batch.codes.map(normalise));
  assert.equal(unique.size, 10, "codes should be unique");
  // Each plaintext verifies against its own hash and no other.
  for (let i = 0; i < batch.codes.length; i++) {
    assert.equal(verifyCode(batch.codes[i], batch.hashes[i]), true);
    assert.equal(verifyCode(batch.codes[(i + 1) % batch.codes.length], batch.hashes[i]), false);
  }
});

test("verifyCode is tolerant of spaces, hyphens, and case", () => {
  const hash = hashCode("ABCDEFGHJK");
  assert.equal(verifyCode("abcdefghjk", hash), true);
  assert.equal(verifyCode("ABCDE-FGHJK", hash), true);
  assert.equal(verifyCode("abcde fghjk", hash), true);
});

test("verifyCode rejects a hash from a different scheme or structure", () => {
  assert.equal(verifyCode("ABCDEFGHJK", "md5$deadbeef"), false);
  assert.equal(verifyCode("ABCDEFGHJK", "scrypt$16384$8$1$too-few-parts"), false);
  assert.equal(verifyCode("ABCDEFGHJK", ""), false);
});

test("formatCode groups a 10-char code as XXXXX-XXXXX", () => {
  assert.equal(formatCode("ABCDEFGHJK"), "ABCDE-FGHJK");
  assert.equal(formatCode("abcde-fghjk"), "ABCDE-FGHJK");
});

test("passwordIssues enforces length, letter, number", () => {
  assert.deepEqual(passwordIssues("Aa1!Aa1!A1"), []); // 10 chars with letter + digit
  const short = passwordIssues("Aa1!Aa1!");
  assert.ok(short.some((m) => m.includes(`${MIN_PASSWORD_LENGTH}`)));
  const noDigit = passwordIssues("abcdefghij");
  assert.ok(noDigit.some((m) => m.toLowerCase().includes("number")));
  const noLetter = passwordIssues("1234567890");
  assert.ok(noLetter.some((m) => m.toLowerCase().includes("letter")));
  const spaces = passwordIssues(" strongenough1");
  assert.ok(spaces.some((m) => m.toLowerCase().includes("space")));
});
