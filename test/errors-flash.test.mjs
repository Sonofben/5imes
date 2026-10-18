import { test } from "node:test";
import assert from "node:assert/strict";
import { friendly, UserError, isRateLimited } from "../src/lib/errors.ts";
import { statusFor } from "../src/lib/throttle.ts";
import { buildCsp } from "../src/lib/csp.ts";

process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
const { flashQuery, readFlash } = await import("../src/lib/flash.ts");
const quiet = () => { const e = console.error; console.error = () => {}; return () => { console.error = e; }; };

test("our own database refusals are shown as written", () => {
  assert.equal(friendly({ code: "P0001", message: "Only the line manager can decide this." }), "Only the line manager can decide this.");
  assert.equal(friendly({ code: "KF429", message: "Too many attempts. Please wait a while and try again." }), "Too many attempts. Please wait a while and try again.");
  assert.equal(friendly(new UserError("Logo must be PNG, JPG or WebP.")), "Logo must be PNG, JPG or WebP.");
});

test("internal database errors never reach the user", () => {
  const restore = quiet();
  const msg = friendly({ code: "XX000", message: 'relation "public.secret_table" does not exist' }, "test");
  restore();
  assert.match(msg, /^Something went wrong on our side\. Please try again \(ref [0-9A-Z]{6}\)\.$/);
  assert.doesNotMatch(msg, /secret_table/);
  assert.equal(friendly({ code: "42501", message: "permission denied for table members" }), "You don’t have permission to do that.");
  assert.equal(friendly({ code: "23505", message: 'duplicate key value violates unique constraint "members_email_key"' }), "That already exists.");
});

test("a fallback sentence keeps one full stop", () => {
  const restore = quiet();
  const msg = friendly(new Error("boom"), "test", "Could not start payment.");
  restore();
  assert.match(msg, /^Could not start payment \(ref [0-9A-Z]{6}\)\.$/);
});

test("rate limits are recognised and get HTTP 429", () => {
  assert.ok(isRateLimited({ code: "KF429" }));
  assert.equal(statusFor({ code: "KF429" }), 429);
  assert.equal(statusFor({ code: "P0001" }), 400);
  assert.equal(statusFor({ code: "XX000" }), 500);
});

test("signed messages are shown; edited or forged ones are not", () => {
  const q = Object.fromEntries(new URLSearchParams(flashQuery({ msg: "Saved.", error: undefined, tab: "staff" })));
  assert.deepEqual(readFlash(q), { msg: "Saved." });
  assert.equal(q.tab, "staff");
  assert.deepEqual(readFlash({ ...q, msg: "Your account is locked. Call 0803 000 0000." }), {});
  assert.deepEqual(readFlash({ error: "Pay ₦50,000 to unlock your account" }), {});
});

test("CSP blocks outside scripts and framing", () => {
  const csp = buildCsp("abc");
  assert.match(csp, /script-src 'self' 'nonce-abc' 'strict-dynamic'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
});
