import { NextResponse } from "next/server";
import { kioskAdmin, kioskError, kioskToken } from "@/lib/kiosk";

/** Search staff by name so a walk-in visitor can say who they are visiting. */
export async function GET(request: Request) {
  const token = await kioskToken();
  if (!token) return NextResponse.json({ error: "This tablet is not set up.", unpaired: true }, { status: 401 });
  const q = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 60);
  const { data, error } = await kioskAdmin().rpc("kiosk_hosts", { p_token: token, p_query: q });
  if (error) return kioskError(error, "hosts");
  return NextResponse.json({ hosts: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
