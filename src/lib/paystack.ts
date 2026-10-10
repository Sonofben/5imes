import { createAdminClient } from "@/lib/supabase/server";
import { BILLING_CYCLES, billingAmountKobo, type BillingCycleId } from "@/lib/billing";
import { PLANS, type PlanId } from "@/lib/constants";

const API = "https://api.paystack.co";

export class PaystackRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "PaystackRequestError";
  }
}

export function isDefinitivePaystackRejection(error: unknown) {
  return error instanceof PaystackRequestError && [400, 401, 403].includes(error.status);
}

function isMissingPaystackTransaction(error: unknown) {
  return error instanceof PaystackRequestError && error.status === 404 && /reference.*not found/i.test(error.message);
}

export function paystackEnabled() {
  return !!process.env.PAYSTACK_SECRET_KEY;
}

export function billingCheckoutEnabled() {
  return paystackEnabled() && !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export async function paystack<T = unknown>(path: string, init?: RequestInit) {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const json = (await res.json()) as { status: boolean; message: string; data: T };
  if (!res.ok || !json.status) throw new PaystackRequestError(json.message || "Paystack request failed", res.status);
  return json.data;
}

export type PaidTx = {
  reference: string;
  status: string;
  amount: number;
  currency?: string;
  customer?: { customer_code?: string } | null;
  plan?: string | { plan_code?: string } | null;
  subscription?: string | { subscription_code?: string; email_token?: string } | null;
};

type PaymentResult = { ok: boolean; reason: string };
type SeatPayment = {
  reference: string;
  kind: string;
  status: string;
  plan: string;
  seats: number;
  billing_interval_months: number;
  amount_kobo: number;
  paystack_plan_code: string | null;
  renewal_sync_status: string;
};

function providerCode(value: string | { plan_code?: string; subscription_code?: string } | null | undefined, key: "plan_code" | "subscription_code") {
  if (typeof value === "string") return value;
  return value?.[key] ?? null;
}

async function syncSeatRenewal(admin: NonNullable<ReturnType<typeof createAdminClient>>, payment: SeatPayment): Promise<PaymentResult> {
  const cycle = Object.entries(BILLING_CYCLES).find(([, item]) => item.months === payment.billing_interval_months)?.[0] as BillingCycleId | undefined;
  if (!cycle || !Object.hasOwn(PLANS, payment.plan as PlanId) || !payment.paystack_plan_code) {
    return { ok: false, reason: "the paid seats are active, but renewal plan details are incomplete" };
  }
  const recurringAmount = billingAmountKobo(PLANS[payment.plan as PlanId].pricePerSeat, payment.seats, cycle);
  try {
    await paystack(`/plan/${encodeURIComponent(payment.paystack_plan_code)}`, {
      method: "PUT",
      body: JSON.stringify({ amount: recurringAmount, update_existing_subscriptions: true }),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Paystack request failed";
    await admin.from("payments").update({ renewal_sync_status: "pending", renewal_sync_error: reason })
      .eq("reference", payment.reference).eq("status", "applied").eq("kind", "seat_increase");
    return { ok: false, reason: `the paid seats are active, but Paystack has not updated the next renewal yet (${reason})` };
  }
  const { error } = await admin.from("payments").update({ renewal_sync_status: "synced", renewal_sync_error: null })
    .eq("reference", payment.reference).eq("status", "applied").eq("kind", "seat_increase");
  if (error) return { ok: false, reason: `the paid seats are active, but the renewal update needs a retry (${error.message})` };
  return { ok: true, reason: "paid seats are active and the next renewal amount is updated" };
}

/** Retry an idempotent Paystack plan-price update after database settlement succeeded. */
export async function retrySeatPlanSync(reference: string): Promise<PaymentResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, reason: "service role key missing" };
  const { data: payment, error } = await admin.from("payments")
    .select("reference,kind,status,plan,seats,billing_interval_months,amount_kobo,paystack_plan_code,renewal_sync_status")
    .eq("reference", reference).eq("kind", "seat_increase").eq("status", "applied").maybeSingle();
  if (error) return { ok: false, reason: error.message };
  if (!payment) return { ok: false, reason: "no applied seat payment needs a renewal retry" };
  if (payment.renewal_sync_status === "synced") return { ok: true, reason: "the recurring price is already updated" };
  return syncSeatRenewal(admin, payment as SeatPayment);
}

/** Refresh one pending checkout on billing-page visits; never infer failure from age alone. */
export async function refreshPendingCheckout(reference: string) {
  const admin = createAdminClient();
  if (!admin || !paystackEnabled()) return;
  const { data: payment, error } = await admin.from("payments")
    .select("reference,status,last_status_check_at,created_at")
    .eq("reference", reference).maybeSingle();
  if (error || !payment || payment.status !== "pending") return;
  const lastCheck = payment.last_status_check_at ? new Date(payment.last_status_check_at).getTime() : 0;
  if (Number.isFinite(lastCheck) && Date.now() - lastCheck < 120_000) return;
  const { error: claimError } = await admin.from("payments").update({ last_status_check_at: new Date().toISOString() })
    .eq("reference", reference).eq("status", "pending");
  if (claimError) return;
  try {
    const tx = await paystack<PaidTx>(`/transaction/verify/${encodeURIComponent(reference)}`);
    await applyPayment(tx);
  } catch (error) {
    const createdAt = Date.parse(payment.created_at);
    if (isMissingPaystackTransaction(error) && Number.isFinite(createdAt) && Date.now() - createdAt >= 10 * 60_000) {
      // A provider-confirmed missing reference is released only after a propagation window.
      await admin.rpc("release_missing_paystack_checkout", { p_reference: reference });
    }
    // Network failures and all other unresolved states keep the reservation for a safe retry.
  }
}

/** Validate and apply a verified transaction using the service-only idempotent database function. */
export async function applyPayment(tx: PaidTx): Promise<PaymentResult> {
  if (!tx?.reference) return { ok: false, reason: "missing payment reference" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, reason: "service role key missing" };
  const { data: payment, error: paymentReadError } = await admin.from("payments")
    .select("kind,status,plan,seats,billing_interval_months,amount_kobo,paystack_plan_code,renewal_sync_status")
    .eq("reference", tx.reference).maybeSingle();
  if (paymentReadError) return { ok: false, reason: paymentReadError.message };

  if (payment?.kind === "seat_increase" && tx.status === "success") {
    if (payment.status === "applied" && payment.renewal_sync_status === "synced") {
      return { ok: true, reason: "paid seats are active and the next renewal amount is updated" };
    }
    if (!(["pending", "applied"] as string[]).includes(payment.status)) return { ok: false, reason: "seat payment is no longer pending" };
    if (tx.currency !== "NGN" || Number(tx.amount) !== Number(payment.amount_kobo)) {
      if (payment.status === "pending") await admin.from("payments").update({ status: "failed" }).eq("reference", tx.reference).eq("status", "pending");
      return { ok: false, reason: "verified seat-proration amount or currency does not match the pending checkout" };
    }
  }

  const { data, error } = await admin.rpc("apply_paystack_payment", {
    p_reference: tx.reference,
    p_status: tx.status,
    p_amount_kobo: Number(tx.amount),
    p_currency: tx.currency ?? "NGN",
    p_customer_code: tx.customer?.customer_code ?? null,
    p_subscription_code: providerCode(tx.subscription, "subscription_code"),
    p_plan_code: providerCode(tx.plan, "plan_code"),
    p_email_token: typeof tx.subscription === "object" ? tx.subscription?.email_token ?? null : null,
  });
  if (error) return { ok: false, reason: error.message };
  const result = (data ?? { ok: false, reason: "No payment result returned." }) as PaymentResult;
  if (!result.ok || payment?.kind !== "seat_increase" || tx.status !== "success") return result;
  if (payment.status === "applied" && payment.renewal_sync_status === "synced") return result;

  // Paid seat capacity is committed before this idempotent provider update. If Paystack is
  // temporarily unavailable, the payment remains applied and this step is safely retryable.
  return syncSeatRenewal(admin, { ...payment, reference: tx.reference } as SeatPayment);
}

export async function recordPaystackSubscription(data: {
  plan?: string | { plan_code?: string } | null;
  subscription_code?: string;
  customer?: { customer_code?: string } | null;
  email_token?: string;
}) {
  const admin = createAdminClient();
  if (!admin) return { ok: false, reason: "service role key missing" };
  const planCode = providerCode(data.plan, "plan_code");
  if (!planCode || !data.subscription_code) return { ok: false, reason: "subscription details missing" };
  const { data: saved, error } = await admin.rpc("record_paystack_subscription", {
    p_plan_code: planCode,
    p_subscription_code: data.subscription_code,
    p_customer_code: data.customer?.customer_code ?? null,
    p_email_token: data.email_token ?? null,
  });
  if (error) return { ok: false, reason: error.message };
  return saved ? { ok: true, reason: "saved" } : { ok: false, reason: "no pending organization matched this plan" };
}

export async function markPaystackInvoiceFailed(subscriptionCode: string) {
  const admin = createAdminClient();
  if (!admin) return { ok: false, reason: "service role key missing" };
  const { data: current, error: readError } = await admin.from("subscriptions").select("status,current_period_end")
    .eq("paystack_subscription_code", subscriptionCode).maybeSingle();
  if (readError) return { ok: false, reason: readError.message };
  if (!current) return { ok: true, reason: "stale invoice event for a superseded subscription ignored" };
  if (current.status !== "active") return { ok: true, reason: "subscription is no longer active; stale invoice event ignored" };

  let providerState: { status?: string };
  try {
    providerState = await paystack<{ status?: string }>(`/subscription/${encodeURIComponent(subscriptionCode)}`);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "could not verify the current Paystack invoice state" };
  }
  if (providerState.status !== "attention") {
    if (["active", "non-renewing", "completed", "cancelled"].includes(providerState.status ?? "")) {
      return { ok: true, reason: "current Paystack subscription state supersedes this failed-invoice event" };
    }
    return { ok: false, reason: `unrecognized Paystack subscription status: ${providerState.status ?? "missing"}` };
  }

  const { data, error } = await admin.rpc("mark_paystack_invoice_failed", {
    p_subscription_code: subscriptionCode,
    p_expected_period_end: current.current_period_end,
  });
  if (error) return { ok: false, reason: error.message };
  if (data) return { ok: true, reason: "marked past due" };
  const { data: latest } = await admin.from("subscriptions").select("status,current_period_end")
    .eq("paystack_subscription_code", subscriptionCode).maybeSingle();
  return !latest || latest.status !== "active" || latest.current_period_end !== current.current_period_end
    ? { ok: true, reason: "stale failed-invoice event ignored after billing state changed" }
    : { ok: false, reason: "invoice state changed concurrently; retry reconciliation" };
}

export async function syncPaystackCancellation(subscriptionCode: string) {
  const admin = createAdminClient();
  if (!admin) return { ok: false, reason: "service role key missing" };
  const { data: current, error: currentError } = await admin.from("subscriptions").select("org_id,updated_at")
    .eq("paystack_subscription_code", subscriptionCode).maybeSingle();
  if (currentError) return { ok: false, reason: currentError.message };
  if (!current) return { ok: true, reason: "stale event for a superseded subscription ignored" };

  let providerState: { status?: string };
  try {
    providerState = await paystack<{ status?: string }>(`/subscription/${encodeURIComponent(subscriptionCode)}`);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "could not verify current Paystack subscription state" };
  }
  const providerStatus = providerState.status;
  let cancelled: boolean;
  if (["active", "attention"].includes(providerStatus ?? "")) cancelled = false;
  else if (["non-renewing", "completed", "cancelled"].includes(providerStatus ?? "")) cancelled = true;
  else return { ok: false, reason: `unrecognized Paystack subscription status: ${providerStatus ?? "missing"}` };

  const { data, error } = await admin.rpc("set_paystack_subscription_cancelled", {
    p_subscription_code: subscriptionCode,
    p_cancelled: cancelled,
    p_expected_updated_at: current.updated_at,
  });
  if (error) return { ok: false, reason: error.message };
  if (data) return { ok: true, reason: "renewal state synchronized with current Paystack status" };
  const { data: stillCurrent } = await admin.from("subscriptions").select("org_id")
    .eq("paystack_subscription_code", subscriptionCode).maybeSingle();
  return stillCurrent
    ? { ok: false, reason: "renewal state changed concurrently; retry after checkout reconciliation" }
    : { ok: true, reason: "stale event for a superseded subscription ignored" };
}
