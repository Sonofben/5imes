import { NextResponse } from "next/server";
import { KIOSK_COOKIE, sameOrigin } from "@/lib/kiosk";

/** Forget the pairing on this tablet (the admin can also switch the tablet off remotely). */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(KIOSK_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
  return res;
}
