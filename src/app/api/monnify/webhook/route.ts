import { NextResponse } from "next/server";
import { monnifySignatureValid, settleMonnify } from "@/lib/monnify";

/**
 * Set in the Monnify dashboard as the webhook URL: https://<your-domain>/api/monnify/webhook
 * The body is only used to know WHICH payment to re-check; the status itself is fetched from Moniepoint.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!monnifySignatureValid(raw, request.headers.get("monnify-signature"))) return new NextResponse("Bad signature", { status: 401 });
  let event: { eventType?: string; eventData?: { paymentReference?: string } };
  try { event = JSON.parse(raw); } catch { return new NextResponse("Invalid JSON", { status: 400 }); }
  const reference = event.eventData?.paymentReference;
  if (reference && /^[-A-Za-z0-9.=]{1,100}$/.test(reference)) {
    try { await settleMonnify(reference); } catch { return new NextResponse("Retry later", { status: 503 }); }
  }
  return NextResponse.json({ received: true });
}
