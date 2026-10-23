import { NextResponse } from "next/server";
import { KIOSK_COOKIE, kioskAdmin, kioskError, sameOrigin } from "@/lib/kiosk";

/** Pair this tablet with a company office using the one-time code an admin created. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const code = typeof body?.code === "string" ? body.code.slice(0, 20) : "";
  const { data, error } = await kioskAdmin().rpc("kiosk_pair", { p_code: code });
  if (error) return kioskError(error, "pair");
  const token = (data as { token?: string } | null)?.token;
  if (!token) return NextResponse.json({ error: "Pairing failed. Ask an admin for a new code." }, { status: 400 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(KIOSK_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 60 * 60 * 24 * 400,
  });
  return res;
}
