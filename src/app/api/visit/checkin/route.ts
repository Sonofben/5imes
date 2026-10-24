import { NextResponse } from "next/server";
import { kioskAdmin, sameOrigin } from "@/lib/kiosk";
import { friendly } from "@/lib/errors";
import { statusFor } from "@/lib/throttle";
import { Admission, VisitPass, parseOrNull } from "@/lib/jsonShapes";
import { CheckinForm } from "@/lib/visitorForms";
import { alertHostAdmitted } from "@/lib/visitors";

/**
 * An invited visitor checks in from their pass link (/v/<token>). The pass token identifies the
 * visit; the code must match it. Reception then admits them (or the company lets invited visitors in).
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const parsed = CheckinForm.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Some details aren’t valid." }, { status: 400 });
  const f = parsed.data;
  const admin = kioskAdmin();
  const { data, error } = await admin.rpc("visit_checkin", { p_token: f.token, p_code: f.code, p_phone: f.phone, p_company: f.company, p_rules_accepted: true });
  if (error) return NextResponse.json({ error: friendly(error, "visit/checkin") }, { status: statusFor(error) });
  const result = parseOrNull(Admission, data, "visit/checkin");
  if (!result) return NextResponse.json({ error: "Something went wrong. Please speak to reception." }, { status: 500 });
  if (result.status === "on_site") {
    const { data: pass } = await admin.rpc("visit_pass", { p_token: f.token });
    await alertHostAdmitted(result, parseOrNull(VisitPass, pass, "visit/checkin.pass")?.timezone ?? "Africa/Lagos");
  }
  return NextResponse.json({ status: result.status });
}
