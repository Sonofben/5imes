import { NextResponse } from "next/server";
import { kioskAdmin, kioskError, kioskToken } from "@/lib/kiosk";

/** Visitors currently signed in at this tablet's office (first name and initial), for signing out. */
export async function GET() {
  const token = await kioskToken();
  if (!token) return NextResponse.json({ error: "This tablet is not set up.", unpaired: true }, { status: 401 });
  const { data, error } = await kioskAdmin().rpc("kiosk_visitors_on_site", { p_token: token });
  if (error) return kioskError(error, "on-site");
  return NextResponse.json({ visitors: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
