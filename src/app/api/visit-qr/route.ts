import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { createAdminClient } from "@/lib/supabase/server";
import { parseOrNull, VisitPass } from "@/lib/jsonShapes";

/** The QR image in a visitor's invitation email. It encodes only the visit's tablet code. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  if (!/^[A-Z2-9]{32}$/.test(token)) return new NextResponse("Not found", { status: 404 });
  const admin = createAdminClient();
  if (!admin) return new NextResponse("Unavailable", { status: 503 });
  const { data } = await admin.rpc("visit_pass", { p_token: token });
  const pass = parseOrNull(VisitPass, data, "api/visit-qr");
  if (!pass) return new NextResponse("Not found", { status: 404 });
  const png = await QRCode.toBuffer(pass.code, { width: 400, margin: 1, errorCorrectionLevel: "M" });
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=600", "X-Robots-Tag": "noindex" },
  });
}
