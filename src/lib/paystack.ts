import { createAdminClient } from "@/lib/supabase/server";
import { PLANS, type PlanId } from "@/lib/constants";

const API = "https://api.paystack.co";

export function paystackEnabled() {
  return !!process.env.PAYSTACK_SECRET_KEY;
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
  if (!res.ok || !json.status) throw new Error(json.message || "Paystack request failed");
  return json.data;
}

type PaidTx = {
  reference: string;
  status: string;
  amount: number; // kobo
  customer?: { customer_code?: string };
  metadata?: { org_id?: string; plan?: PlanId; seats?: number | string };
};

/** Apply a successful payment: activate the plan for 30 days. Idempotent per reference. */
export async function applyPayment(tx: PaidTx) {
  if (tx.status !== "success") return { ok: false, reason: "not successful" };
  const orgId = tx.metadata?.org_id;
  const plan = tx.metadata?.plan;
  const seats = Number(tx.metadata?.seats ?? 0);
  if (!orgId || !plan || !(plan in PLANS) || seats < 1) return { ok: false, reason: "bad metadata" };
  if (tx.amount < seats * PLANS[plan].pricePerSeat * 100) return { ok: false, reason: "amount mismatch" };

  const admin = createAdminClient();
  if (!admin) return { ok: false, reason: "service role key missing" };

  const { data: sub } = await admin.from("subscriptions").select("*").eq("org_id", orgId).single();
  if (!sub) return { ok: false, reason: "no subscription" };
  if (sub.last_reference === tx.reference) return { ok: true, reason: "already applied" };

  const base = Math.max(Date.now(), sub.current_period_end ? new Date(sub.current_period_end).getTime() : 0);
  const { error } = await admin
    .from("subscriptions")
    .update({
      plan,
      status: "active",
      seats_paid: seats,
      current_period_end: new Date(base + 30 * 86400000).toISOString(),
      paystack_customer: tx.customer?.customer_code ?? sub.paystack_customer,
      last_reference: tx.reference,
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", orgId);
  return error ? { ok: false, reason: error.message } : { ok: true };
}
