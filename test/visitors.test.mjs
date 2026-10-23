import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
const { zonedIso } = await import("../src/lib/visitors.ts");
const { InviteForm } = await import("../src/lib/visitorForms.ts");

test("visit times are read in the company's time zone", () => {
  assert.equal(zonedIso("2026-10-23", "10:00", "Africa/Lagos"), "2026-10-23T09:00:00.000Z");       // UTC+1
  assert.equal(zonedIso("2026-10-23", "00:00", "UTC"), "2026-10-23T00:00:00.000Z");
  assert.equal(zonedIso("2026-03-29", "12:00", "Europe/London"), "2026-03-29T11:00:00.000Z");      // after the clocks change
  assert.equal(zonedIso("2026-13-01", "10:00", "Africa/Lagos"), null);
  assert.equal(zonedIso("2026-10-23", "25:00", "Africa/Lagos"), null);
});

test("the invitation form checks its fields", () => {
  const ok = InviteForm.safeParse({ location: "8a1f0d5e-6b0a-4c55-9e1a-0b2b3c4d5e6f", name: "Tolu Ade", email: "", date: "2026-10-23", time: "10:00", host: "" });
  assert.ok(ok.success);
  assert.equal(ok.data.email, null);
  assert.equal(ok.data.host, null);
  assert.equal(InviteForm.safeParse({ location: "x", name: "Tolu", date: "2026-10-23", time: "10:00" }).success, false);
  assert.equal(InviteForm.safeParse({ location: "8a1f0d5e-6b0a-4c55-9e1a-0b2b3c4d5e6f", name: "T", date: "2026-10-23", time: "10:00" }).success, false);
  assert.equal(InviteForm.safeParse({ location: "8a1f0d5e-6b0a-4c55-9e1a-0b2b3c4d5e6f", name: "Tolu", email: "bad", date: "2026-10-23", time: "10:00" }).success, false);
});
