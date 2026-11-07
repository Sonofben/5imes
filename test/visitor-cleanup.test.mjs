import { test } from "node:test";
import assert from "node:assert/strict";
import { visitorCleanupDryRun, cleanupDone, cleanupSummary, runVisitorCleanup } from "../src/lib/visitorCleanup.ts";

const row = (org_id, d, p, s, w, a) => ({ org_id, details_due: d, photos_due: p, sign_out_due: s, waiting_due: w, audit_due: a });

test("dry run is on by default on staging, off on live, and the variable decides when set", () => {
  assert.equal(visitorCleanupDryRun({ APP_ENV: "staging" }), true);
  assert.equal(visitorCleanupDryRun({}), false);
  assert.equal(visitorCleanupDryRun({ VISITOR_CLEANUP_DRY_RUN: "1" }), true);
  assert.equal(visitorCleanupDryRun({ VISITOR_CLEANUP_DRY_RUN: "true" }), true);
  assert.equal(visitorCleanupDryRun({ APP_ENV: "staging", VISITOR_CLEANUP_DRY_RUN: "0" }), false);
  assert.equal(visitorCleanupDryRun({ VISITOR_CLEANUP_DRY_RUN: " Off " }), false);
  assert.equal(visitorCleanupDryRun({ VISITOR_CLEANUP_DRY_RUN: "maybe" }), false);
});

test("what a live run did is the counts before minus the counts after, per company", () => {
  const done = cleanupDone([row("a", 5, 2, 1, 0, 0), row("b", 3, 0, 0, 0, 0)], [row("a", 1, 0, 0, 0, 0), row("b", 3, 0, 0, 0, 0)]);
  assert.deepEqual(done, [{ org_id: "a", details: 4, photos: 2, sign_outs: 1, waiting: 0, audit: 0 }]);
  // A company no longer listed afterwards had everything done.
  assert.deepEqual(cleanupDone([row("c", 2, 1, 0, 1, 7)], []), [{ org_id: "c", details: 2, photos: 1, sign_outs: 0, waiting: 1, audit: 7 }]);
});

test("the summary has counts and company ids only, and fits the operations log", () => {
  const s = cleanupSummary(true, [{ org_id: "a", details: 1, photos: 2, sign_outs: 3, waiting: 4, audit: 5 }]);
  assert.match(s, /^Dry run, nothing changed: 1 company\. a details 1, photos 2, signed out 3, cancelled 4, audit 5$/);
  const many = Array.from({ length: 60 }, (_, i) => ({ org_id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`, details: 1, photos: 1, sign_outs: 1, waiting: 1, audit: 1 }));
  assert.ok(cleanupSummary(false, many).length <= 1000);
  assert.equal(cleanupSummary(false, []), "Done: 0 companies");
});

test("a dry run only reads the preview: nothing is deleted or signed out", async () => {
  const calls = [];
  const admin = {
    rpc: async (name) => { calls.push(name); return name === "vms_purge_preview" ? { data: [row("a", 2, 1, 1, 0, 0)], error: null } : { data: [], error: null }; },
    storage: { from: () => ({ remove: async () => { calls.push("storage.remove"); return { error: null }; } }) },
  };
  const result = await runVisitorCleanup(admin, true);
  assert.deepEqual(calls, ["vms_purge_preview"]);
  assert.equal(result.dryRun, true);
  assert.deepEqual(result.companies, [{ org_id: "a", details: 2, photos: 1, sign_outs: 1, waiting: 0, audit: 0 }]);
});

test("a live run cleans up, removes the photos and reports what was done", async () => {
  const calls = [];
  let previews = 0;
  const admin = {
    rpc: async (name) => {
      calls.push(name);
      if (name === "vms_purge_preview") return { data: previews++ === 0 ? [row("a", 2, 1, 0, 0, 0)] : [], error: null };
      return { data: [{ photo_path: "a/one.jpg" }], error: null };
    },
    storage: { from: () => ({ remove: async (paths) => { calls.push(`storage.remove:${paths.join(",")}`); return { error: null }; } }) },
  };
  const result = await runVisitorCleanup(admin, false);
  assert.deepEqual(calls, ["vms_purge_preview", "vms_purge_expired", "storage.remove:a/one.jpg", "vms_purge_preview"]);
  assert.deepEqual(result.companies, [{ org_id: "a", details: 2, photos: 1, sign_outs: 0, waiting: 0, audit: 0 }]);
  assert.match(result.summary, /^Done: 1 company/);
});

test("a database error fails the job instead of being ignored", async () => {
  const admin = { rpc: async () => ({ data: null, error: { message: "boom" } }) };
  await assert.rejects(runVisitorCleanup(admin, false), /boom/);
});
