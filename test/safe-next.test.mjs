import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNextPath } from "../src/lib/safeNext.ts";

test("a path on this site is kept", () => {
  assert.equal(safeNextPath("/admin", "/start"), "/admin");
  assert.equal(safeNextPath("/admin/reports/export?from=2026-11-01&to=2026-11-07", "/start"), "/admin/reports/export?from=2026-11-01&to=2026-11-07");
  // Still a path on this site: https://5imes.click/@evil.com
  assert.equal(safeNextPath("/@evil.com", "/start"), "/@evil.com");
});

test("anything that could leave the site gives the default", () => {
  for (const bad of [
    "//evil.com", "/\\evil.com", "\\\\evil.com", "@evil.com", "evil.com", "https://evil.com", "javascript:alert(1)",
    "/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "/ /evil.com", "/a\\b", "/" + "a".repeat(2001), "", null, undefined,
  ]) {
    assert.equal(safeNextPath(bad, "/start"), "/start", `${JSON.stringify(bad)} should fall back`);
  }
});
