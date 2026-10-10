"use client";

import { useState } from "react";
import { BILLING_CYCLES, billingAmountKobo, type BillingCycleId } from "@/lib/billing";
import { naira, type PlanId } from "@/lib/constants";

const CYCLE_OPTIONS: { id: BillingCycleId; label: string }[] = [
  { id: "monthly", label: "Monthly · 1 month" },
  { id: "quarterly", label: "Quarterly · 3 months" },
  { id: "semiannual", label: "Biannually · 6 months" },
  { id: "annual", label: "Yearly · 12 months" },
];

export function PlanCheckoutCard({
  plan, minSeats, defaultCycle, enabled,
}: {
  plan: { id: PlanId; name: string; pricePerSeat: number; blurb: string; features: readonly string[] };
  minSeats: number;
  defaultCycle: BillingCycleId;
  enabled: boolean;
}) {
  const [cycle, setCycle] = useState<BillingCycleId>(defaultCycle);
  const [seats, setSeats] = useState(minSeats);
  const [submitting, setSubmitting] = useState(false);
  const safeSeats = Number.isSafeInteger(seats) && seats >= minSeats ? seats : minSeats;
  const amountNaira = billingAmountKobo(plan.pricePerSeat, safeSeats, cycle) / 100;
  const months = BILLING_CYCLES[cycle].months;

  return (
      <form action="/api/paystack/initialize" method="post" onSubmit={() => setSubmitting(true)} className={`card flex h-full flex-col gap-5 ${plan.id === "pro" ? "border-ink ring-1 ring-ink/5" : ""}`}>
      <input type="hidden" name="plan" value={plan.id} />
      <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">{plan.id === "pro" ? "For growing teams" : "For focused teams"}</p><h2 className="mt-1 text-xl font-bold">{plan.name}</h2><p className="mt-1 text-sm text-muted">{plan.blurb}</p></div>{plan.id === "pro" && <span className="chip shrink-0 bg-brand/10 text-brand-dark">More controls</span>}</div>
      <div className="rounded-xl bg-paper p-4"><p className="text-sm text-muted">Per seat · per month</p><p className="mt-1 text-3xl font-extrabold tracking-tight">{naira(plan.pricePerSeat)}<span className="ml-1 text-sm font-medium text-muted">/ month</span></p></div>
      <ul className="space-y-2 text-sm leading-5">{plan.features.map((feature) => <li key={feature} className="flex gap-2"><span aria-hidden="true" className="font-bold text-ok">✓</span><span>{feature}</span></li>)}</ul>
      <div className="mt-auto space-y-4 border-t border-line pt-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor={`${plan.id}-cycle`}>Billing period</label><select id={`${plan.id}-cycle`} name="cycle" className="input" value={cycle} onChange={(event) => setCycle(event.target.value as BillingCycleId)}>{CYCLE_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
          <div><label className="label" htmlFor={`${plan.id}-seats`}>Seats to purchase</label><input id={`${plan.id}-seats`} name="seats" type="number" min={minSeats} max={10000} required className="input tabular-nums" value={safeSeats} onChange={(event) => setSeats(Number(event.target.value))}/><p className="mt-1 text-[11px] text-muted">Minimum {minSeats} active + invited</p></div>
        </div>
        <div className="rounded-xl border border-line bg-[#fafbf9] p-4">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs text-muted">Due now · {months} month{months === 1 ? "" : "s"} · no long-term discount</p><p className="mt-1 text-sm text-muted">{safeSeats} seats × {naira(plan.pricePerSeat)} × {months}</p></div><p aria-live="polite" className="text-right text-xl font-extrabold tabular-nums">{naira(amountNaira)}</p></div>
        </div>
        <button disabled={!enabled || submitting} className={`${plan.id === "pro" ? "btn-brand" : "btn-primary"} w-full`}>{submitting ? "Starting secure checkout…" : enabled ? `Continue to Paystack · ${naira(amountNaira)}` : "Paystack setup required"}</button>
        {!enabled && <p className="text-xs leading-5 text-muted">Checkout opens once the Paystack secret key and Supabase service credentials are configured.</p>}
      </div>
    </form>
  );
}
