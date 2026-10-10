import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isDefinitivePaystackRejection, paystack, paystackEnabled } from "@/lib/paystack";
import { siteUrl } from "@/lib/site";

export async function POST(request: Request) {
  const base = siteUrl(request);
  const back = (query: Record<string, string>) => NextResponse.redirect(`${base}/admin/billing?${new URLSearchParams(query)}`, { status: 303 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${base}/login`, { status: 303 });
  const { data: member } = await supabase.from("members").select("id,org_id,role,status").eq("user_id", user.id).maybeSingle();
  if (!member || member.status !== "active" || !["owner", "admin"].includes(member.role)) return back({ error: "Only organization admins can add seats." });
  if (!paystackEnabled()) return back({ error: "Paystack is not configured yet." });
  if (!user.email) return back({ error: "Your account needs an email address before checkout." });
  const admin = createAdminClient();
  if (!admin) return back({ error: "Supabase server credentials are not configured." });

  const form = await request.formData();
  const seats = Number(form.get("seats"));
  if (!Number.isSafeInteger(seats) || seats < 1 || seats > 10000) return back({ error: "Choose a valid seat count." });
  const reference = `5ime-seats-${randomUUID()}`;
  const { data, error } = await supabase.rpc("prepare_paystack_seat_increase", { p_reference: reference, p_seats: seats });
  if (error || !data?.ok) return back({ error: error?.message ?? data?.reason ?? "Could not prepare the seat increase." });
  const amount = Number(data.amount_kobo);
  if (!Number.isSafeInteger(amount) || amount < 1) {
    await admin.from("payments").update({ status: "failed" }).eq("reference", reference).eq("status", "pending");
    return back({ error: "The prorated amount is invalid." });
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
          payment_kind: "seat_increase",
          target_seats: String(seats),
          custom_fields: [{ display_name: "Added seats", variable_name: "added_seats", value: String(data.added_seats) }],
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
    const detail = error instanceof Error ? error.message : "Could not start the seat checkout.";
    const message = transactionRequestStarted && !definitivelyRejected
      ? `Paystack may have created this seat checkout. Check the pending attempt before trying again. (${detail})`
      : detail;
    return back({ error: message });
  }
}
