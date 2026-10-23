import { NextResponse } from "next/server";
import { kioskAdmin, kioskError, kioskToken, sameOrigin } from "@/lib/kiosk";
import { uuid } from "@/lib/schemas";

/** Sign a visitor out: by the code on their badge or pass, or by choosing their name from the list. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const token = await kioskToken();
  if (!token) return NextResponse.json({ error: "This tablet is not set up.", unpaired: true }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const code = typeof body?.code === "string" && body.code.trim() ? body.code.slice(0, 20) : null;
  const visit = uuid.safeParse(body?.visit).success ? (body.visit as string) : null;
  if (!code && !visit) return NextResponse.json({ error: "Choose your name or type your code." }, { status: 400 });
  const { data, error } = await kioskAdmin().rpc("kiosk_sign_out", { p_token: token, p_code: code, p_visit: visit });
  if (error) return kioskError(error, "sign-out");
  return NextResponse.json({ ok: true, visitor: (data as { visitor?: string } | null)?.visitor ?? "" });
}
