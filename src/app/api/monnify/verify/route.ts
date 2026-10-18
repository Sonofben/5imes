import { NextResponse } from "next/server";
import { settleMonnify } from "@/lib/monnify";
import { siteUrl } from "@/lib/site";
import { flashQuery } from "@/lib/flash";
import { friendly } from "@/lib/errors";
import { throttle } from "@/lib/throttle";
import { createClient } from "@/lib/supabase/server";

/** Moniepoint sends the payer back here; the status is always re-checked with Moniepoint server-side. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = siteUrl(request);
  const reference = url.searchParams.get("reference") || url.searchParams.get("paymentReference");
  const to = (q: Record<string, string>) => NextResponse.redirect(`${base}/admin/billing?${flashQuery(q)}`);
  if (!reference || !/^[-A-Za-z0-9.=]{1,100}$/.test(reference)) return to({ error: "Missing or invalid payment reference." });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${base}/login`);
  const limited = await throttle(supabase, "payment_verify");
  if (limited) return to({ error: limited });
  try {
    const r = await settleMonnify(reference);
    if (r.ok) return to({ msg: "Payment received — thank you. Your plan is active." });
    if (r.reason === "still in progress") return to({ error: `Moniepoint still shows this payment as ${r.status.toLowerCase()}. If you paid by transfer it can take a few minutes — use “Check payment status” again shortly.` });
    if (r.reason === "payment not successful") return to({ msg: `Moniepoint shows this payment as ${r.status.toLowerCase()}. Nothing was activated; you can try again.` });
    return to({ error: `Payment needs attention: ${r.reason}` });
  } catch (error) {
    return to({ error: friendly(error, "api/monnify/verify", "Could not check the payment.") });
  }
}
