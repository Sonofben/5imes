import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { signatureMatches } from "../src/lib/monnifySignature.ts";

test("Moniepoint webhook signature: accepts the right one, rejects tampering", () => {
  const body = JSON.stringify({ eventType: "SUCCESSFUL_TRANSACTION", eventData: { paymentReference: "5ime-abc" } });
  const sig = createHmac("sha512", "secret-key").update(body).digest("hex");
  assert.equal(signatureMatches(body, sig, "secret-key"), true);
  assert.equal(signatureMatches(body, sig.toUpperCase(), "secret-key"), true);
  assert.equal(signatureMatches(body + " ", sig, "secret-key"), false);
  assert.equal(signatureMatches(body, sig, "other-key"), false);
  assert.equal(signatureMatches(body, null, "secret-key"), false);
  assert.equal(signatureMatches(body, sig, undefined), false);
});
