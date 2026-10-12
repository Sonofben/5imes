import test from "node:test";
import assert from "node:assert/strict";
import { generateRecoveryCodes, normalise, formatCode } from "../src/lib/recoveryCodes.ts";
import { passwordIssues, MIN_PASSWORD_LENGTH } from "../src/lib/password.ts";

test("generateRecoveryCodes produces ten unique 10-character codes", () => {
  const batch = generateRecoveryCodes();
  assert.equal(batch.codes.length, 10);
  const unique = new Set(batch.codes.map(normalise));
  assert.equal(unique.size, 10, "codes should be unique");
  for (const code of batch.codes) {
    assert.equal(normalise(code).length, 10, `code "${code}" normalises to 10 characters`);
    assert.match(code, /^[A-Z0-9]{5}-[A-Z0-9]{5}$/, `code "${code}" is displayed as XXXXX-XXXXX`);
  }
});

test("normalise strips separators and uppercases", () => {
  assert.equal(normalise("abcde-fghjk"), "ABCDEFGHJK");
  assert.equal(normalise("abcde fghjk"), "ABCDEFGHJK");
  assert.equal(normalise("abcde_fghjk!"), "ABCDEFGHJK");
});

test("formatCode groups a 10-char code as XXXXX-XXXXX", () => {
  assert.equal(formatCode("ABCDEFGHJK"), "ABCDE-FGHJK");
  assert.equal(formatCode("abcde-fghjk"), "ABCDE-FGHJK");
  // A short input returns as-is; display grouping is only for exact-length codes.
  assert.equal(formatCode("ABC"), "ABC");
});

test("passwordIssues enforces length, letter, number", () => {
  assert.deepEqual(passwordIssues("abcdef12"), []); // 8 chars with letter + digit
  const short = passwordIssues("ab12cd");
  assert.ok(short.some((m) => m.includes(`${MIN_PASSWORD_LENGTH}`)));
  const noDigit = passwordIssues("abcdefgh");
  assert.ok(noDigit.some((m) => m.toLowerCase().includes("number")));
  const noLetter = passwordIssues("12345678");
  assert.ok(noLetter.some((m) => m.toLowerCase().includes("letter")));
  const spaces = passwordIssues(" strong1!");
  assert.ok(spaces.some((m) => m.toLowerCase().includes("space")));
});
