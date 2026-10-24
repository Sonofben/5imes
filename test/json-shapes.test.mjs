// Checks the app's jsonb schemas (src/lib/jsonShapes.ts) against what the database functions
// really return. CI's database job dumps the outputs with supabase/shapes/dump.sql first;
// where no dump exists (for example a plain `npm test` on a laptop) these checks are skipped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import * as S from "../src/lib/jsonShapes.ts";

const dir = new URL("../supabase/shapes/out/", import.meta.url);
const cases = {
  "public_plans.json": S.PublicPlans,
  "console_overview.json": S.ConsoleOverview,
  "console_health.json": S.ConsoleHealth,
  "console_revenue.json": S.ConsoleRevenue,
  "console_plans.json": S.ConsolePlans,
  "console_security.json": S.ConsoleSecurity,
  "console_company.json": S.ConsoleCompany,
  "console_company_snapshot.json": S.ConsoleSnapshot,
  "invitation.json": S.Invitation,
  "vms_report.json": S.VisitorReport,
  "vms_desk_find.json": S.DeskVisit,
  "visit_pass.json": S.VisitPass,
  "walkin_context.json": S.WalkinContext,
  "visit_checkin.json": S.Admission,
  "vms_admit.json": S.Admission,
  "my_org_brand.json": S.BrandShape,
};

for (const [file, schema] of Object.entries(cases)) {
  const path = new URL(file, dir);
  test(`${file} matches its schema`, { skip: !existsSync(path) && "no database dump" }, () => {
    const text = readFileSync(path, "utf8").trim();
    assert.ok(text, `${file} is empty`);
    const parsed = schema.safeParse(JSON.parse(text));
    assert.ok(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 5), null, 2));
  });
}
