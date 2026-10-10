import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { applyPayment, markPaystackInvoiceFailed, recordPaystackSubscription, syncPaystackCancellation, type PaidTx } from "@/lib/paystack";

type WebhookEvent = { event?: string; data?: PaidTx & {
  subscription_code?: string;
  subscription?: string | { subscription_code?: string; email_token?: string } | null;
  email_token?: string;
  plan?: string | { plan_code?: string } | null;
}; };

/** Configure as https://<your-domain>/api/paystack/webhook in Paystack. */
export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return new NextResponse("Not configured", { status: 503 });
  const raw = await request.text();
  const signature = request.headers.get("x-paystack-signature") ?? "";
  const expected = crypto.createHmac("sha512", secret).update(raw).digest("hex");
  if (!/^[a-f0-9]{128}$/i.test(signature) || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return new NextResponse("Bad signature", { status: 401 });
  }

  let event: WebhookEvent;
  try { event = JSON.parse(raw) as WebhookEvent; }
  catch { return new NextResponse("Invalid JSON", { status: 400 }); }
  const data = event.data;
  if (!data) return NextResponse.json({ received: true });

  if (event.event === "charge.success") {
    const result = await applyPayment(data);
    if (!result.ok) return new NextResponse(`Payment reconciliation needs retry: ${result.reason}`, { status: 503 });
  } else if (event.event === "subscription.create") {
    const nested = typeof data.subscription === "object" ? data.subscription : null;
    const result = await recordPaystackSubscription({
      plan: data.plan,
      subscription_code: data.subscription_code ?? nested?.subscription_code ?? "",
      customer: data.customer,
      email_token: data.email_token ?? nested?.email_token,
    });
    if (!result.ok) return new NextResponse("Subscription ledger not ready; retry later", { status: 503 });
  } else if (event.event === "invoice.payment_failed") {
    const nested = typeof data.subscription === "object" ? data.subscription : null;
    const code = data.subscription_code ?? nested?.subscription_code;
    if (code) {
      const result = await markPaystackInvoiceFailed(code);
      if (!result.ok) return new NextResponse("Billing service unavailable; retry later", { status: 503 });
    }
  } else if (event.event === "subscription.disable" || event.event === "subscription.not_renew") {
    const nested = typeof data.subscription === "object" ? data.subscription : null;
    const code = data.subscription_code ?? nested?.subscription_code;
    if (!code) return new NextResponse("Subscription code missing; retry later", { status: 503 });
    const result = await syncPaystackCancellation(code);
    if (!result.ok) return new NextResponse("Subscription state unavailable; retry later", { status: 503 });
  }

  return NextResponse.json({ received: true });
}
