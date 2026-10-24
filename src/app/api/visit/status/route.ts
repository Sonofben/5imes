import { NextResponse } from "next/server";
import { kioskAdmin } from "@/lib/kiosk";
import { VisitPass, parseOrNull } from "@/lib/jsonShapes";

/** The visitor's waiting screen asks every few seconds whether reception has let them in. Status only. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  if (!/^[A-Z2-9]{32}$/.test(token)) return NextResponse.json({ status: "unknown" }, { status: 404 });
  const { data } = await kioskAdmin().rpc("visit_pass", { p_token: token });
  const pass = parseOrNull(VisitPass, data, "visit/status");
  return NextResponse.json({ status: pass?.status ?? "unknown" }, { status: pass ? 200 : 404, headers: { "Cache-Control": "no-store" } });
}
