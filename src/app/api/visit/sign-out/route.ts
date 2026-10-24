import { NextResponse } from "next/server";
import { z } from "zod";
import { kioskAdmin, sameOrigin } from "@/lib/kiosk";
import { friendly } from "@/lib/errors";
import { statusFor } from "@/lib/throttle";

const Body = z.object({ token: z.string().regex(/^[A-Z2-9]{32}$/) });

/** A visitor signs themselves out from their phone when they leave. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "This visitor pass is not valid." }, { status: 400 });
  const { error } = await kioskAdmin().rpc("visit_sign_out", { p_token: parsed.data.token });
  if (error) return NextResponse.json({ error: friendly(error, "visit/sign-out") }, { status: statusFor(error) });
  return NextResponse.json({ status: "left" });
}
