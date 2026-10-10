import { NextResponse } from "next/server";
import { applyPayment, paystack, type PaidTx } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";

/** Paystack redirects here after checkout; the status is always verified server-side. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = siteUrl(request);
  const reference = url.searchParams.get("reference") || url.searchParams.get("trxref");
  if (!reference) return NextResponse.redirect(`${base}/admin/billing?error=Missing+payment+reference`);
  // Only verify references this app created; arbitrary references never reach Paystack.
  if (!/^[-A-Za-z0-9.=]{1,100}$/.test(reference)) return NextResponse.redirect(`${base}/admin/billing?error=Invalid+payment+reference`);
  const admin = createAdminClient();
  if (!admin) return NextResponse.redirect(`${base}/admin/billing?error=Billing+service+is+not+configured`);
  const { data: known, error: lookupError } = await admin.from("payments").select("reference").eq("reference", reference).maybeSingle();
  if (lookupError) return NextResponse.redirect(`${base}/admin/billing?error=Could+not+check+this+payment.+Try+again.`);
  if (!known) return NextResponse.redirect(`${base}/admin/billing?error=Unknown+payment+reference`);

  try {
    const tx = await paystack<PaidTx>(`/transaction/verify/${encodeURIComponent(reference)}`);
    if (tx.status !== "success") {
      const result = await applyPayment(tx);
      if (["failed", "abandoned", "reversed"].includes(tx.status)) {
        if (result.reason !== "payment not successful") {
          const error = `Paystack confirms this checkout was ${tx.status}, but the local reservation could not be closed yet: ${result.reason}`;
          return NextResponse.redirect(`${base}/admin/billing?${new URLSearchParams({ error })}`);
        }
        const label = tx.status === "abandoned" ? "abandoned" : tx.status === "reversed" ? "reversed" : "failed";
        const msg = `Paystack confirms this checkout was ${label}. No seats or new subscription were activated, and its pending reservation is closed. You can try again.`;
        return NextResponse.redirect(`${base}/admin/billing?${new URLSearchParams({ msg })}`);
      }
      const error = `Paystack still reports this checkout as ${tx.status || "in progress"}. Keep or resume the same checkout and check again before starting another payment.`;
      return NextResponse.redirect(`${base}/admin/billing?${new URLSearchParams({ error })}`);
    }

    const result = await applyPayment(tx);
    const message = result.reason === "paid seats are active and the next renewal amount is updated"
      ? "Payment verified. Added seats are active and the next recurring renewal includes them."
      : "Payment received — your plan is active. Thank you!";
    const query: Record<string, string> = result.ok ? { msg: message } : { error: `Payment received but needs reconciliation: ${result.reason}` };
    return NextResponse.redirect(`${base}/admin/billing?${new URLSearchParams(query)}`);
  } catch (error) {
    return NextResponse.redirect(`${base}/admin/billing?${new URLSearchParams({ error: error instanceof Error ? error.message : "Verification failed" })}`);
  }
}
