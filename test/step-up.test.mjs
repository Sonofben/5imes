import { test } from "node:test";
import assert from "node:assert/strict";
import { stepUpUrl, isStepUpError, hasFreshStepUp, STEP_UP_MINUTES } from "../src/lib/stepUp.ts";
import { friendly } from "../src/lib/errors.ts";

// The window itself (fresh for 5 minutes, then blocked again) is enforced and tested in the database:
// supabase/tests/98_zzzz2_step_up.sql. These tests cover the app side.

/** A stand-in for the Supabase client: rpc("step_up_fresh") answers with `reply`. */
const fakeSupabase = (reply) => ({ rpc: async (name) => (name === "step_up_fresh" ? reply : { data: null, error: { message: "unexpected" } }) });

test("the code screen comes back to the same page, and only to this site", () => {
  assert.equal(stepUpUrl("/admin/reports/export?from=2026-11-01&to=2026-11-07"),
    "/auth/verify?next=%2Fadmin%2Freports%2Fexport%3Ffrom%3D2026-11-01%26to%3D2026-11-07");
  assert.equal(stepUpUrl("//evil.com"), "/auth/verify?next=%2Fadmin");
  assert.equal(STEP_UP_MINUTES, 5);
});

test("the database's fresh-code refusal is recognised and shown as written", () => {
  const err = { code: "KF412", message: "Enter a fresh code from your authenticator app to do this." };
  assert.equal(isStepUpError(err), true);
  assert.equal(isStepUpError({ code: "P0001" }), false);
  assert.equal(isStepUpError(null), false);
  assert.equal(friendly(err, "test"), err.message);
});

test("blocked without a fresh code, allowed with one, and fails closed on errors", async () => {
  assert.equal(await hasFreshStepUp(fakeSupabase({ data: true, error: null })), true);
  assert.equal(await hasFreshStepUp(fakeSupabase({ data: false, error: null })), false);
  assert.equal(await hasFreshStepUp(fakeSupabase({ data: null, error: { message: "network" } })), false);
});
