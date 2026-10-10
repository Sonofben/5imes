import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isDefinitivePaystackRejection, paystack, paystackEnabled } from "@/lib/paystack";
import { PLANS, type PlanId } from "@/lib/constants";
import { BILLING_CYCLES, type BillingCycleId } from "@/lib/billing";
import { siteUrl } from "@/lib/site";

export async function POST(request: Request) {
  const base = siteUrl(request);
  const back = (query: Record<string, string>) => NextResponse.redirect(`${base}/admin/billing?${new URLSearchParams(query)}`, { status: 303 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${base}/login`, { status: 303 });

  const { data: me } = await supabase.from("members").select("id,org_id,role,status").eq("user_id", user.id).maybeSingle();
  if (!me || me.status !== "active" || !["owner", "admin"].includes(me.role)) return back({ error: "Only admins can change billing." });
  if (!paystackEnabled()) return back({ error: "Online payment is not connected yet. Complete Paystack setup before selecting a subscription." });

  const form = await request.formData();
  const plan = String(form.get("plan") || "") as PlanId;
  const cycle = String(form.get("cycle") || "monthly") as BillingCycleId;
  if (!Object.hasOwn(PLANS, plan)) return back({ error: "Choose a valid plan." });
  if (!Object.hasOwn(BILLING_CYCLES, cycle)) return back({ error: "Choose a valid billing period." });

  const [{ count: assignedSeats }, admin] = await Promise.all([
    supabase.from("members").select("id", { count: "exact", head: true }).eq("org_id", me.org_id).in("status", ["active", "invited"]),
    Promise.resolve(createAdminClient()),
  ]);
  const existingSeats = Math.max(1, assignedSeats ?? 0);
  const requested = String(form.get("seats") || existingSeats);
  const seats = Number(requested);
  if (!Number.isSafeInteger(seats) || seats < existingSeats || seats > 10000) {
    return back({ error: `Choose at least ${existingSeats} seats (your active and invited people), and no more than 10,000.` });
  }
  if (!user.email) return back({ error: "Add an email address to your account before starting payment." });
  if (!admin) return back({ error: "Supabase server credentials are not configured, so the verified payment ledger is unavailable." });

  const reference = `5ime-${me.org_id.slice(0, 8)}-${crypto.randomUUID()}`;
  const interval = BILLING_CYCLES[cycle];
  const { data: reservation, error: reservationError } = await supabase.rpc("prepare_paystack_subscription", {
    p_reference: reference,
    p_plan: plan,
    p_seats: seats,
    p_months: interval.months,
  });
  if (reservationError || !reservation?.ok) {
    return back({ error: reservationError?.message ?? reservation?.reason ?? "Could not reserve this subscription checkout." });
  }
  const amount = Number(reservation.amount_kobo);
  if (!Number.isSafeInteger(amount) || amount < 1) {
    await admin.from("payments").update({ status: "failed" }).eq("reference", reference).eq("status", "pending");
    return back({ error: "The reserved subscription amount is invalid." });
  }

  let transactionRequestStarted = false;
  try {
    const name = `5ime ${PLANS[plan].name} · ${seats} seats · ${interval.label} · ${me.org_id.slice(0, 8)}`.slice(0, 90);
    const paystackPlan = await paystack<{ plan_code: string }>("/plan", {
      method: "POST",
      body: JSON.stringify({ name, amount, interval: interval.paystackInterval, currency: "NGN" }),
    });
    if (!paystackPlan.plan_code) throw new Error("Paystack did not return a recurring plan code.");
    const { error: savePlanError } = await admin.from("payments").update({ paystack_plan_code: paystackPlan.plan_code })
      .eq("reference", reference).eq("status", "pending");
    if (savePlanError) throw new Error(`Could not save the Paystack plan code: ${savePlanError.message}`);

    // From this point a network failure may occur after Paystack created the transaction.
    // Keep the reservation pending until the provider's verify endpoint resolves its status.
    transactionRequestStarted = true;
    const transaction = await paystack<{ authorization_url?: string }>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: user.email,
        amount,
        currency: "NGN",
        reference,
        plan: paystackPlan.plan_code,
        callback_url: `${base}/api/paystack/verify`,
        // Optional: route the payment to a Paystack subaccount (ACCT_...). Empty = main account.
        ...(process.env.PAYSTACK_SUBACCOUNT ? { subaccount: process.env.PAYSTACK_SUBACCOUNT } : {}),
        metadata: {
          payment_reference: reference,
          custom_fields: [
            { display_name: "Plan", variable_name: "plan", value: PLANS[plan].name },
            { display_name: "Seats", variable_name: "seats", value: String(seats) },
            { display_name: "Billing period", variable_name: "billing_period", value: interval.label },
          ],
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
    const detail = error instanceof Error ? error.message : "Could not start payment. Please try again.";
    const message = transactionRequestStarted && !definitivelyRejected
      ? `Paystack may have created this checkout. Check the pending attempt before trying again. (${detail})`
      : detail;
    return back({ error: message });
  }
}
