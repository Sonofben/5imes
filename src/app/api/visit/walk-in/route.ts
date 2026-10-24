import { NextResponse } from "next/server";
import { kioskAdmin, sameOrigin } from "@/lib/kiosk";
import { friendly } from "@/lib/errors";
import { statusFor } from "@/lib/throttle";
import { WalkinResult, parseOrNull } from "@/lib/jsonShapes";
import { WalkinForm } from "@/lib/visitorForms";
import { clientKey } from "@/lib/visitors";

/**
 * A walk-in visitor sends their details from their own phone (after scanning the reception poster).
 * Returns their private status-page token; reception admits them from the desk.
 * Limits: 10 sign-ins per device (IP) per hour and 300 per office link per hour, in the database.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const parsed = WalkinForm.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Some details aren’t valid." }, { status: 400 });
  const f = parsed.data;
  const { data, error } = await kioskAdmin().rpc("walkin_submit", {
    p_link: f.link, p_client: clientKey(request), p_name: f.name, p_phone: f.phone, p_email: f.email, p_company: f.company,
    p_reason: f.reason, p_purpose: f.purpose, p_host_hint: f.host, p_rules_accepted: true,
  });
  if (error) return NextResponse.json({ error: friendly(error, "visit/walk-in") }, { status: statusFor(error) });
  const result = parseOrNull(WalkinResult, data, "visit/walk-in");
  if (!result) return NextResponse.json({ error: "Something went wrong. Please speak to reception." }, { status: 500 });
  return NextResponse.json({ pass: result.pass_token, status: result.status });
}
