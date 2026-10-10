import { requireMember, type Subscription } from "@/lib/session";
import { BILLING_CYCLES, type BillingCycleId } from "@/lib/billing";
import { PLANS, naira, type PlanId } from "@/lib/constants";
import { billingCheckoutEnabled, refreshPendingCheckout } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/server";
import { Flash } from "@/components/Flash";
import { PlanCheckoutCard } from "./PlanCheckoutCard";
import { BillingSubscriptionActions } from "./BillingSubscriptionActions";
import { SeatIncreaseCard } from "./SeatIncreaseCard";
import { retrySeatRenewalPrice } from "./actions";

export const dynamic = "force-dynamic";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, org } = await requireMember({ admin: true });
  const [{ data: initialSub }, { count }] = await Promise.all([
    supabase.from("subscriptions").select("*").eq("org_id", org.id).maybeSingle<Subscription>(),
    supabase.from("members").select("id", { count: "exact", head: true }).eq("org_id", org.id).in("status", ["active", "invited"]),
  ]);
  let sub = initialSub;
  const checkoutEnabled = billingCheckoutEnabled();
  const admin = createAdminClient();
  const readPaymentStates = async () => {
    if (!admin) return { pendingSeat: null, pendingSubscription: null, sync: null };
    const [pendingSeatResult, pendingSubscriptionResult, syncResult] = await Promise.all([
      admin.from("payments").select("reference,seats,amount_kobo,checkout_url,created_at")
        .eq("org_id", org.id).eq("kind", "seat_increase").eq("status", "pending")
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("payments").select("reference,plan,seats,billing_interval_months,amount_kobo,checkout_url,created_at")
        .eq("org_id", org.id).eq("kind", "subscription").eq("status", "pending")
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("payments").select("reference,renewal_sync_error,created_at")
        .eq("org_id", org.id).eq("kind", "seat_increase").eq("status", "applied").eq("renewal_sync_status", "pending")
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    return { pendingSeat: pendingSeatResult.data, pendingSubscription: pendingSubscriptionResult.data, sync: syncResult.data };
  };
  let paymentStates = await readPaymentStates();
  if (admin && checkoutEnabled && (paymentStates.pendingSeat || paymentStates.pendingSubscription)) {
    for (const reference of [paymentStates.pendingSeat?.reference, paymentStates.pendingSubscription?.reference]) {
      if (reference) await refreshPendingCheckout(reference);
    }
    paymentStates = await readPaymentStates();
    const refreshedSubscription = await supabase.from("subscriptions").select("*").eq("org_id", org.id).maybeSingle<Subscription>();
    if (refreshedSubscription.data) sub = refreshedSubscription.data;
  }
  const pendingSeatChange = paymentStates.pendingSeat;
  const pendingSubscription = paymentStates.pendingSubscription;
  const renewalSyncPending = paymentStates.sync;
  const historyResult = admin
    ? await admin.from("payments").select("reference,plan,seats,billing_interval_months,amount_kobo,currency,status,kind,created_at,applied_at")
      .eq("org_id", org.id).order("created_at", { ascending: false }).limit(50)
    : { data: null };
  const paymentHistory = (historyResult.data ?? []) as {
    reference: string; plan: PlanId; seats: number; billing_interval_months: number; amount_kobo: number | string;
    currency: string; status: string; kind: string; created_at: string; applied_at: string | null;
  }[];
  const minSeats = Math.max(1, count ?? 0);
  const currentCycle = (Object.entries(BILLING_CYCLES).find(([, cycle]) => cycle.months === sub?.billing_interval_months)?.[0] ?? "monthly") as BillingCycleId;
  const fmt = (date?: string | null) => date ? new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: org.timezone }).format(new Date(date)) : "—";
  const dueDate = sub?.status === "trialing" ? sub.trial_ends_at : sub?.current_period_end;
  const accessUntil = fmt(dueDate);
  const paidPeriodActive = !!sub?.current_period_end && new Date(sub.current_period_end).getTime() > Date.now();
  const providerRenewalStillOn = !!sub?.paystack_subscription_code && !sub.cancel_at_period_end;
  const checkoutPending = !!pendingSeatChange || !!pendingSubscription;
  const canStartNewTerm = !checkoutPending && !(
    (paidPeriodActive && ["active", "past_due"].includes(sub?.status ?? "")) || providerRenewalStillOn ||
    (paidPeriodActive && !!sub?.cancel_at_period_end)
  );
  const statusText = sub?.status === "trialing"
    ? `Pro trial · access until ${accessUntil}`
    : sub?.cancel_at_period_end
      ? `Auto-renewal off · access until ${accessUntil}`
      : sub?.status === "active"
        ? `${PLANS[sub.plan].name} · renews every ${sub.billing_interval_months} month${sub.billing_interval_months === 1 ? "" : "s"}`
        : sub?.status === "past_due"
          ? `Payment needs attention · access through ${accessUntil}`
          : sub?.status ?? "No active subscription";
  const renewalEnabled = checkoutEnabled && !pendingSubscription && !!sub?.paystack_subscription_code;
  const seatIncreaseEnabled = checkoutEnabled && !pendingSubscription && !renewalSyncPending && sub?.status === "active" && !sub.cancel_at_period_end
    && !!sub.paystack_plan_code && !!sub.paystack_subscription_code && !!sub.current_period_start
    && !!sub.current_period_end && new Date(sub.current_period_end).getTime() > Date.now();

  return (
    <div className="space-y-6">
      <div><p className="eyebrow">Organization</p><h1 className="page-heading">Billing</h1><p className="page-description">A clear per-seat subscription for your team. Choose a billing term; longer terms have no discount.</p></div>
      <Flash msg={sp.msg} error={sp.error} />

      <section className="card grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div><p className="eyebrow">Current subscription</p><h2 className="mt-1 text-lg font-bold">{statusText}</h2><p className="mt-1 text-sm text-muted">{sub?.status === "trialing" ? `Trial ends ${fmt(sub.trial_ends_at)}.` : sub?.status === "active" ? `Current paid period ends ${accessUntil}.` : sub?.current_period_end ? `Current access ends ${accessUntil}.` : "Your subscription details will appear here."}</p>
          {sub?.status === "active" && !sub.cancel_at_period_end && <p className="mt-2 text-xs text-muted">Next charge: {sub.seats_paid} paid seats × {naira(PLANS[sub.plan].pricePerSeat)} × {sub.billing_interval_months} months.</p>}
        </div>
        <div className="rounded-xl bg-paper px-5 py-4 lg:min-w-40 lg:text-right"><p className="eyebrow">Active + invited seats</p><p className="mt-1 text-3xl font-bold tabular-nums">{minSeats}</p>{sub?.status === "active" && <p className="text-xs text-muted">{sub.seats_paid} paid</p>}</div>
      </section>

      {renewalEnabled && <section className="card flex flex-wrap items-center justify-between gap-4">
        <div><h2 className="font-semibold">Automatic renewal</h2><p className="mt-1 max-w-2xl text-sm text-muted">{sub?.cancel_at_period_end ? `Renewal is off. The team keeps access until ${accessUntil}.` : "Your plan renews automatically through Paystack. Cancel any time; existing paid access remains until the period end."}</p></div>
        <BillingSubscriptionActions cancelled={!!sub?.cancel_at_period_end} />
      </section>}

      {pendingSubscription && <section className="card border-warn/30 bg-amber-50/50" role="status"><p className="eyebrow text-warn">Subscription checkout in progress</p><h2 className="mt-1 font-semibold">{PLANS[pendingSubscription.plan as PlanId]?.name ?? "Subscription"} · {pendingSubscription.seats} seats · {pendingSubscription.billing_interval_months} months</h2><p className="mt-1 text-sm text-muted">Reserved charge: {naira(Number(pendingSubscription.amount_kobo) / 100)}. Resume or verify this same attempt before starting another checkout to avoid duplicate charges.</p><div className="mt-3 flex flex-wrap gap-2">{pendingSubscription.checkout_url && <a className="btn-brand" href={pendingSubscription.checkout_url} target="_blank" rel="noreferrer">Continue pending checkout</a>}<a className="btn-ghost" href={`/api/paystack/verify?reference=${encodeURIComponent(pendingSubscription.reference)}`}>Check payment status</a></div></section>}

      {pendingSeatChange && <section className="card border-warn/30 bg-amber-50/50" role="status"><p className="eyebrow text-warn">Seat payment in progress</p><h2 className="mt-1 font-semibold">Adding seats to your subscription</h2><p className="mt-1 text-sm text-muted">Target capacity: {pendingSeatChange.seats} seats · prorated charge: {naira(Number(pendingSeatChange.amount_kobo) / 100)}.</p><p className="mt-2 text-xs leading-5 text-muted">Seats remain reserved until Paystack confirms the result. Checking status closes the reservation only after Paystack reports the checkout failed, was abandoned or was reversed.</p><div className="mt-3 flex flex-wrap gap-2">{pendingSeatChange.checkout_url && <a className="btn-brand" href={pendingSeatChange.checkout_url} target="_blank" rel="noreferrer">Continue Paystack checkout</a>}<a className="btn-ghost" href={`/api/paystack/verify?reference=${encodeURIComponent(pendingSeatChange.reference)}`}>Check status and release if unpaid</a></div></section>}

      {renewalSyncPending && <section className="card border-warn/30 bg-amber-50/50" role="status"><p className="eyebrow text-warn">Payment received · renewal update pending</p><h2 className="mt-1 font-semibold">Your new seats are active</h2><p className="mt-1 text-sm leading-6 text-muted">The prorated payment is verified and the added capacity is active. The next recurring amount has not yet been confirmed by Paystack. Retry the price update here; this does not charge you again.</p><form action={retrySeatRenewalPrice} className="mt-3"><button className="btn-primary" disabled={!checkoutEnabled}>{checkoutEnabled ? "Retry renewal price update" : "Paystack setup is not ready"}</button></form></section>}

      {seatIncreaseEnabled && sub?.current_period_start && sub.current_period_end && <SeatIncreaseCard paidSeats={sub.seats_paid} assignedSeats={minSeats} pricePerSeat={PLANS[sub.plan].pricePerSeat} cycle={currentCycle} periodStart={sub.current_period_start} periodEnd={sub.current_period_end} enabled={!pendingSeatChange && checkoutEnabled} />}

      {canStartNewTerm ? <div className="grid gap-4 xl:grid-cols-2">{Object.values(PLANS).map((plan) => <PlanCheckoutCard key={plan.id} plan={plan} minSeats={minSeats} defaultCycle={currentCycle} enabled={checkoutEnabled} />)}</div> : <section className="card border-dashed bg-[#fafbf9]"><h2 className="font-semibold">{checkoutPending ? "Resolve the pending checkout first" : "No overlapping subscriptions"}</h2><p className="mt-1 text-sm leading-6 text-muted">{pendingSubscription ? "A subscription payment is already in progress. Resume it or check its verified Paystack status; a second plan cannot be opened until the first attempt is resolved." : pendingSeatChange ? "A paid seat increase is still unresolved. Check or resume that same Paystack transaction before starting a new subscription." : paidPeriodActive ? `Your current plan remains active until ${accessUntil}. You can select a new plan after that date; an early checkout would create mismatched renewal dates. ${sub?.cancel_at_period_end ? "Renewal is off, so seat top-ups are unavailable for this term." : seatIncreaseEnabled ? "You can add seats now using the prorated checkout above." : "Seat top-ups are unavailable until the active Paystack subscription is linked."}` : "Automatic Paystack renewal is still active. Turn it off before creating another plan."}</p></section>}
      <p className="text-xs leading-5 text-muted">Quarterly is 3 months; biannually is 6 months; yearly is 12 months. Total = seats × monthly price per seat × months, charged upfront in naira. Paystack will show the recurring-payment methods supported for this account.</p>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="eyebrow">Billing records</p><h2 className="text-lg font-bold">Payment history</h2><p className="mt-1 text-sm text-muted">Latest 50 recorded payment attempts. Receipts are available for confirmed payments.</p></div></div>
        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm"><div className="overflow-x-auto"><table className="table">
          <thead><tr><th>Date</th><th>Description</th><th>Reference</th><th>Amount</th><th>Status</th><th>Receipt</th></tr></thead>
          <tbody>{paymentHistory.length === 0 ? <tr><td colSpan={6} className="text-muted">No payments are recorded yet.</td></tr> : paymentHistory.map((payment) => {
            const date = payment.applied_at ?? payment.created_at;
            const dateLabel = new Intl.DateTimeFormat("en-NG", { timeZone: org.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(date));
            const description = payment.kind === "seat_increase" ? `Seat increase · target ${payment.seats}` : `${PLANS[payment.plan]?.name ?? payment.plan} · ${payment.seats} seat${payment.seats === 1 ? "" : "s"} · ${payment.billing_interval_months} month${payment.billing_interval_months === 1 ? "" : "s"}`;
            const statusStyle = payment.status === "applied" ? "bg-green-50 text-ok" : payment.status === "failed" ? "bg-red-50 text-bad" : "bg-amber-50 text-warn";
            return <tr key={payment.reference}><td className="whitespace-nowrap text-xs">{dateLabel}</td><td>{description}</td><td className="max-w-48 break-all font-mono text-xs">{payment.reference}</td><td className="whitespace-nowrap tabular-nums">{naira(Number(payment.amount_kobo) / 100)}</td><td><span className={`chip ${statusStyle}`}>{payment.status === "applied" ? "Paid" : payment.status === "failed" ? "Failed" : "Pending"}</span></td><td>{payment.status === "applied" ? <a className="btn-ghost btn-sm" href={`/admin/billing/receipt/${encodeURIComponent(payment.reference)}`}>Receipt</a> : <span className="text-xs text-muted">—</span>}</td></tr>;
          })}</tbody>
        </table></div></div>
      </section>
    </div>
  );
}
