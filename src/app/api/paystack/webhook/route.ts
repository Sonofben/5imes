import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { applyPayment } from "@/lib/paystack";

/** Paystack webhook — set the URL to https://<your-domain>/api/paystack/webhook in the Paystack dashboard. */
export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return new NextResponse("Not configured", { status: 503 });

  const raw = await request.text();
  const signature = request.headers.get("x-paystack-signature") ?? "";
  const expected = crypto.createHmac("sha512", secret).update(raw).digest("hex");
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return new NextResponse("Bad signature", { status: 401 });
  }

  const event = JSON.parse(raw) as { event: string; data: Parameters<typeof applyPayment>[0] };
  if (event.event === "charge.success") await applyPayment(event.data);
  return NextResponse.json({ received: true });
}
