import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isDefinitivePaystackRejection, paystack, paystackEnabled } from "@/lib/paystack";
import { siteUrl } from "@/lib/site";
import { twoStepRedirect, twoStepState } from "@/lib/session";
import { flashQuery } from "@/lib/flash";
import { friendly } from "@/lib/errors";
import { Reservation, parseResult } from "@/lib/schemas";

export async function POST(request: Request) {
  const base = siteUrl(request);
  const back = (query: Record<string, string>) => NextResponse.redirect(`${base}/admin/billing?${flashQuery(query)}`, { status: 303 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${base}/login`, { status: 303 });
  const { data: member } = await supabase.from("members").select("id,org_id,role,status").eq("user_id", user.id).maybeSingle();
  if (!member || member.status !== "active" || !["owner", "admin"].includes(member.role)) return back({ error: "Only organization admins can change billing." });
  const twoStep = await twoStepState(supabase, user.id);
  if (twoStep !== "ok") return NextResponse.redirect(`${base}${twoStepRedirect(twoStep)}`, { status: 303 });
  if (!paystackEnabled()) return back({ error: "Paystack is not configured yet." });
  if (!user.email) return back({ error: "Your account needs an email address before checkout." });
  const admin = createAdminClient();
  if (!admin) return back({ error: "Supabase server credentials are not configured." });

  const form = await request.formData();
  const places = Number(form.get("field_seats"));
  if (!Number.isSafeInteger(places) || places < 1 || places > 10000) return back({ error: "Choose a valid number of field staff places." });
  const reference = `5ime-field-${randomUUID()}`;
  const { data: raw, error } = await supabase.rpc("prepare_paystack_field_addon", { p_reference: reference, p_field_seats: places });
  const data = parseResult(Reservation, raw, "api/paystack/field", { ok: false, reason: "The payment could not be reserved." });
  if (error || !data.ok) return back({ error: (error ? friendly(error, "api/paystack/field") : data.reason) ?? "Could not prepare the field staff add-on." });
  const amount = Number(data.amount_kobo);
  if (!Number.isSafeInteger(amount) || amount < 1) {
    await admin.from("payments").update({ status: "failed" }).eq("reference", reference).eq("status", "pending");
    return back({ error: "The field staff amount is invalid." });
  }

  let transactionRequestStarted = false;
  try {
    transactionRequestStarted = true;
    const transaction = await paystack<{ authorization_url?: string }>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: user.email,
        amount,
        currency: "NGN",
        reference,
        callback_url: `${base}/api/paystack/verify`,
        // Optional: route the payment to a Paystack subaccount (ACCT_...). Empty = main account.
        ...(process.env.PAYSTACK_SUBACCOUNT ? { subaccount: process.env.PAYSTACK_SUBACCOUNT } : {}),
        metadata: {
          payment_reference: reference,
          payment_kind: "field_addon",
          field_seats: String(places),
          custom_fields: [{ display_name: "Field staff places", variable_name: "field_seats", value: String(places) }],
        },
      }),
    });
    if (!transaction.authorization_url) throw new Error("Paystack did not return a checkout link.");
    await admin.from("payments").update({ checkout_url: transaction.authorization_url }).eq("reference", reference).eq("status", "pending");
    return NextResponse.redirect(transaction.authorization_url, { status: 303 });
  } catch (error) {
    const definitivelyRejected = isDefinitivePaystackRejection(error);
    if (!transactionRequestStarted || definitivelyRejected) {
      await admin.from("payments").update({ status: "failed" }).eq("reference", reference).eq("status", "pending");
    }
    const detail = friendly(error, "api/paystack/field", "Could not start the field staff checkout.");
    const message = transactionRequestStarted && !definitivelyRejected
      ? `Paystack may have created this field staff checkout. Check the pending attempt before trying again. (${detail})`
      : detail;
    return back({ error: message });
  }
}
