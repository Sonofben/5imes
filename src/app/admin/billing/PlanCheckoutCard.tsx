"use client";

import { useState } from "react";
import { BILLING_CYCLES, billingAmountKobo, type BillingCycleId } from "@/lib/billing";
import { naira, FIELD_ADDON_PRICE, type PlanId } from "@/lib/constants";

const CYCLE_OPTIONS: { id: BillingCycleId; label: string }[] = [
  { id: "monthly", label: "Monthly · 1 month" },
  { id: "quarterly", label: "Quarterly · 3 months" },
  { id: "semiannual", label: "Biannually · 6 months" },
  { id: "annual", label: "Yearly · 12 months" },
];

export function PlanCheckoutCard({
  plan, minSeats, defaultCycle, enabled, allowAutoRenew = true, payAheadUntil, providers = ["paystack"], fieldPlaces = 0, fieldUsed = 0, percentOff = 0, amountOffKobo = 0,
}: {
  /** A Global Admin deal for this company: a percentage or an amount taken off each payment. */
  percentOff?: number;
  amountOffKobo?: number;
  /** Field staff add-on places the company has now, and field staff in use (Pro only). */
  fieldPlaces?: number;
  fieldUsed?: number;
  /** Payment providers switched on, in display order. */
  providers?: ("paystack" | "monnify")[];
  plan: { id: PlanId; name: string; pricePerSeat: number; blurb: string; features: readonly string[]; maxSeats?: number | null };
  minSeats: number;
  defaultCycle: BillingCycleId;
  enabled: boolean;
  /** Auto-renew can only be chosen when no paid term is running. */
  allowAutoRenew?: boolean;
  /** When set, this checkout books the next term starting on this date. */
  payAheadUntil?: string;
}) {
  const [cycle, setCycle] = useState<BillingCycleId>(defaultCycle);
  const [seats, setSeats] = useState(minSeats);
  const [submitting, setSubmitting] = useState(false);
  const maxSeats = plan.maxSeats ?? 10000;
  const tooMany = minSeats > maxSeats;
  const safeSeats = Number.isSafeInteger(seats) && seats >= minSeats ? Math.min(seats, maxSeats) : minSeats;
  const months = BILLING_CYCLES[cycle].months;
  const isPro = plan.id === "pro";
  const [field, setField] = useState(Math.max(fieldPlaces, fieldUsed));
  const safeField = isPro ? (Number.isSafeInteger(field) && field >= fieldUsed ? Math.min(field, safeSeats) : fieldUsed) : 0;
  const grossNaira = billingAmountKobo(plan.pricePerSeat, safeSeats, cycle) / 100 + safeField * FIELD_ADDON_PRICE * months;
  // Same rule as the database: the discount never takes a payment below ₦100.
  const discountNaira = Math.max(0, Math.min(percentOff ? Math.round(grossNaira * percentOff) / 100 : amountOffKobo / 100, grossNaira - 100));
  const amountNaira = grossNaira - discountNaira;
  const fieldBlocksMonnify = safeField > 0;

  return (
      <form action="/api/paystack/initialize" method="post" onSubmit={() => setSubmitting(true)} className={`card flex h-full flex-col gap-5 ${plan.id === "pro" ? "border-ink ring-1 ring-ink/5" : ""}`}>
      <input type="hidden" name="plan" value={plan.id} />
      <input type="hidden" name="kind" value="subscription" />
      <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">{plan.id === "premium" ? "For offices with visitors" : plan.id === "pro" ? "For growing teams" : "For focused teams"}</p><h2 className="mt-1 text-xl font-bold">{plan.name}</h2><p className="mt-1 text-sm text-muted">{plan.blurb}</p></div>{plan.id === "pro" && <span className="chip shrink-0 bg-brand/10 text-brand-dark">More controls</span>}</div>
      <div className="rounded-xl bg-paper p-4"><p className="text-sm text-muted">Per seat · per month</p><p className="mt-1 text-3xl font-extrabold tracking-tight">{naira(plan.pricePerSeat)}<span className="ml-1 text-sm font-medium text-muted">/ month</span></p></div>
      <ul className="space-y-2 text-sm leading-5">{plan.features.map((feature) => <li key={feature} className="flex gap-2"><span aria-hidden="true" className="font-bold text-ok">✓</span><span>{feature}</span></li>)}</ul>
      <div className="mt-auto space-y-4 border-t border-line pt-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor={`${plan.id}-cycle`}>Billing period</label><select id={`${plan.id}-cycle`} name="cycle" className="input" value={cycle} onChange={(event) => setCycle(event.target.value as BillingCycleId)}>{CYCLE_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
          <div><label className="label" htmlFor={`${plan.id}-seats`}>Seats to purchase</label><input id={`${plan.id}-seats`} name="seats" type="number" min={minSeats} max={maxSeats} required className="input tabular-nums" value={safeSeats} onChange={(event) => setSeats(Number(event.target.value))}/><p className="mt-1 text-[11px] text-muted">Minimum {minSeats} active + invited{plan.maxSeats ? ` · up to ${plan.maxSeats} on ${plan.name}` : ""}</p></div>
        </div>
        {isPro && <div><label className="label" htmlFor="pro-field">Field staff places (optional add-on)</label>
          <input id="pro-field" name="field_seats" type="number" min={fieldUsed} max={safeSeats} className="input tabular-nums" value={safeField} onChange={(event) => setField(Number(event.target.value))} />
          <p className="mt-1 text-[11px] leading-4 text-muted">{naira(FIELD_ADDON_PRICE)} per field person a month, for the same term. Client sites and visit check-in for sales reps, engineers and officers. Paid with Paystack.{fieldUsed > 0 ? ` You have ${fieldUsed} field staff now.` : ""}</p></div>}
        {plan.id === "premium" && <p className="text-[11px] leading-4 text-muted">Field staff is included in Premium at no extra cost.</p>}
        {allowAutoRenew && providers.includes("paystack") ? (
          <label className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm">
            <input type="checkbox" name="auto_renew" className="mt-0.5 h-4 w-4" />
            <span><b>Renew automatically</b> (optional, card payments with Paystack only). Paystack charges this card every {months === 1 ? "month" : `${months} months`} until you turn it off. Leave unticked to pay each term yourself — we&apos;ll remind you before it ends.</span>
          </label>
        ) : (
          <p className="rounded-xl bg-paper p-3 text-xs leading-5 text-muted">One-off payment — nothing is charged automatically.{payAheadUntil ? ` This new term starts when your current term ends (${payAheadUntil}).` : ""}</p>
        )}
        <div className="rounded-xl border border-line bg-[#fafbf9] p-4">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs text-muted">Due now · {months} month{months === 1 ? "" : "s"} · no long-term discount</p><p className="mt-1 text-sm text-muted">{safeSeats} seats × {naira(plan.pricePerSeat)} × {months}{safeField > 0 ? ` + ${safeField} field staff × ${naira(FIELD_ADDON_PRICE)} × ${months}` : ""}{discountNaira > 0 ? <span className="block text-ok">Special price: {naira(discountNaira)} off</span> : null}</p></div><p aria-live="polite" className="text-right text-xl font-extrabold tabular-nums">{naira(amountNaira)}</p></div>
        </div>
        {tooMany ? (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-warn">You have {minSeats} staff. {plan.name} includes up to {maxSeats}, so choose Pro or Premium.</p>
        ) : !enabled ? (
          <button disabled className="btn-primary w-full">Online payment coming soon</button>
        ) : (
          <div className="grid gap-2">
            {providers.includes("monnify") && !fieldBlocksMonnify && <button formAction="/api/monnify/checkout" disabled={submitting} className={`${plan.id === "pro" ? "btn-brand" : "btn-primary"} w-full`}>{submitting ? "Starting secure checkout…" : `Pay with Moniepoint · ${naira(amountNaira)}`}</button>}
            {providers.includes("paystack") && <button formAction="/api/paystack/initialize" disabled={submitting} className={`${providers.includes("monnify") ? "btn-ghost" : plan.id === "pro" ? "btn-brand" : "btn-primary"} w-full`}>{submitting ? "Starting secure checkout…" : `Pay with Paystack · ${naira(amountNaira)}`}</button>}
            {providers.includes("monnify") && <p className="text-[11px] leading-4 text-muted">Moniepoint: card, bank transfer or USSD. One-off payment for this term.</p>}
          </div>
        )}
        {!enabled && <p className="text-xs leading-5 text-muted">Online payment isn&apos;t switched on yet. Your trial keeps running in the meantime.</p>}
      </div>
    </form>
  );
}
