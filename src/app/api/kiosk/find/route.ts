import { NextResponse } from "next/server";
import { kioskAdmin, kioskError, kioskToken, sameOrigin } from "@/lib/kiosk";
import { KioskVisit, parseOrNull } from "@/lib/jsonShapes";

/** Look up an invitation by the code on the visitor's pass (scanned or typed). */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const token = await kioskToken();
  if (!token) return NextResponse.json({ error: "This tablet is not set up.", unpaired: true }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const code = typeof body?.code === "string" ? body.code.slice(0, 20) : "";
  const { data, error } = await kioskAdmin().rpc("kiosk_find_visit", { p_token: token, p_code: code });
  if (error) return kioskError(error, "find");
  const visit = parseOrNull(KioskVisit, data, "kiosk/find");
  return visit ? NextResponse.json({ visit }) : NextResponse.json({ error: "We couldn’t find that invitation." }, { status: 404 });
}
