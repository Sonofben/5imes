import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { monnifyEnabled, monnifyInit } from "@/lib/monnify";
import { PLANS as DEFAULT_PLANS, type PlanId } from "@/lib/constants";
import { loadPlans } from "@/lib/plans";
import { BILLING_CYCLES, type BillingCycleId } from "@/lib/billing";
import { siteUrl } from "@/lib/site";
import { flashQuery } from "@/lib/flash";
import { friendly } from "@/lib/errors";
import { Reservation, parseResult } from "@/lib/schemas";

/**
 * Start a Moniepoint (Monnify) checkout for a new term (kind=subscription) or added seats (kind=seats).
 * Always a one-off payment: Moniepoint terms never renew automatically.
 * The amount is reserved by the same database functions as Paystack, so prices and rules are identical.
 */
export async function POST(request: Request) {
  const base = siteUrl(request);
  const back = (query: Record<string, string>) => NextResponse.redirect(`${base}/admin/billing?${flashQuery(query)}`, { status: 303 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${base}/login`, { status: 303 });
  const { data: me } = await supabase.from("members").select("id,org_id,role,status,full_name").eq("user_id", user.id).maybeSingle();
  if (!me || me.status !== "active" || !["owner", "admin"].includes(me.role)) return back({ error: "Only admins can change billing." });
  if (!monnifyEnabled()) return back({ error: "Moniepoint payment is not switched on yet." });
  if (!user.email) return back({ error: "Add an email address to your account before starting payment." });
  const admin = createAdminClient();
  if (!admin) return back({ error: "Supabase server credentials are not configured." });

  const form = await request.formData();
  const kind = String(form.get("kind") || "subscription");
  const { plans } = await loadPlans(supabase);
  let reference: string;
  let amount: number;
  let description: string;

  if (kind === "seats") {
    const seats = Number(form.get("seats"));
    if (!Number.isSafeInteger(seats) || seats < 1 || seats > 10000) return back({ error: "Choose a valid seat count." });
    reference = `5ime-seats-${randomUUID()}`;
    const { data: raw, error } = await supabase.rpc("prepare_paystack_seat_increase", { p_reference: reference, p_seats: seats });
    const data = parseResult(Reservation, raw, "api/monnify/checkout", { ok: false, reason: "The payment could not be reserved." });
    if (error || !data.ok) return back({ error: (error ? friendly(error, "api/monnify/checkout") : data.reason) ?? "Could not reserve this seat payment." });
    amount = Number(data.amount_kobo);
    description = `5ime seats → ${seats}`;
  } else {
    const plan = String(form.get("plan") || "") as PlanId;
    const cycle = String(form.get("cycle") || "monthly") as BillingCycleId;
    if (!Object.hasOwn(DEFAULT_PLANS, plan)) return back({ error: "Choose a valid plan." });
    if (!Object.hasOwn(BILLING_CYCLES, cycle)) return back({ error: "Choose a valid billing period." });
    const seats = Number(form.get("seats"));
    if (!Number.isSafeInteger(seats) || seats < 1 || seats > 10000) return back({ error: "Choose a valid seat count." });
    reference = `5ime-${me.org_id.slice(0, 8)}-${randomUUID()}`;
    const { data: raw, error } = await supabase.rpc("prepare_paystack_subscription", {
      p_reference: reference, p_plan: plan, p_seats: seats, p_months: BILLING_CYCLES[cycle].months, p_auto_renew: false,
    });
    const data = parseResult(Reservation, raw, "api/monnify/checkout", { ok: false, reason: "The payment could not be reserved." });
    if (error || !data.ok) return back({ error: (error ? friendly(error, "api/monnify/checkout") : data.reason) ?? "Could not reserve this payment." });
    amount = Number(data.amount_kobo);
    description = `5ime ${plans[plan].name} · ${seats} seats · ${BILLING_CYCLES[cycle].label}`;
  }
  if (!Number.isSafeInteger(amount) || amount < 1) {
    await admin.from("payments").update({ status: "failed" }).eq("reference", reference).eq("status", "pending");
    return back({ error: "The reserved amount is invalid." });
  }
  await admin.from("payments").update({ provider: "monnify" }).eq("reference", reference).eq("status", "pending");

  try {
    const tx = await monnifyInit({
      reference, amountKobo: amount, email: user.email, name: me.full_name || user.email, description,
      redirectUrl: `${base}/api/monnify/verify?reference=${encodeURIComponent(reference)}`,
    });
    await admin.from("payments").update({ checkout_url: tx.checkoutUrl }).eq("reference", reference).eq("status", "pending");
    return NextResponse.redirect(tx.checkoutUrl, { status: 303 });
  } catch (error) {
    const detail = friendly(error, "api/monnify/checkout", "Could not start payment.");
    // If we never got past signing in to Moniepoint, no checkout exists: release the reservation.
    // Otherwise keep it pending so "Check payment status" can confirm what happened.
    if (detail.startsWith("Moniepoint sign-in failed")) await admin.from("payments").update({ status: "failed" }).eq("reference", reference).eq("status", "pending");
    return back({ error: `${detail} If you were charged, use “Check payment status” on this page before trying again.` });
  }
}
