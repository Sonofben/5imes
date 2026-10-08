import { NextResponse } from "next/server";
import { applyPayment, paystack } from "@/lib/paystack";

/** Paystack redirects here after checkout. We verify server-side, then apply. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = process.env.NEXT_PUBLIC_SITE_URL || url.origin;
  const reference = url.searchParams.get("reference") || url.searchParams.get("trxref");
  if (!reference) return NextResponse.redirect(`${base}/admin/billing?error=Missing+payment+reference`);

  try {
    const tx = await paystack<Parameters<typeof applyPayment>[0]>(`/transaction/verify/${encodeURIComponent(reference)}`);
    const result = await applyPayment(tx);
    const q: Record<string, string> = result.ok ? { msg: "Payment received — your plan is active. Thank you!" } : { error: `Payment not applied: ${result.reason}` };
    return NextResponse.redirect(`${base}/admin/billing?${new URLSearchParams(q)}`);
  } catch (e) {
    return NextResponse.redirect(`${base}/admin/billing?${new URLSearchParams({ error: e instanceof Error ? e.message : "Verification failed" })}`);
  }
}
