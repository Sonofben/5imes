"use client";

import { useState } from "react";
import { BILLING_CYCLES, proratedFieldAmountKobo, type BillingCycleId } from "@/lib/billing";
import { naira, FIELD_ADDON_PRICE } from "@/lib/constants";

/** Pro: buy more field staff places during the paid term, prorated to the end of the term. */
export function FieldAddonCard({ places, used, paidSeats, cycle, periodStart, periodEnd, enabled }: {
  places: number; used: number; paidSeats: number; cycle: BillingCycleId; periodStart: string; periodEnd: string; enabled: boolean;
}) {
  const first = Math.min(paidSeats, Math.max(places, used) + 1);
  const [target, setTarget] = useState(first);
  const full = places >= paidSeats;
  const safe = Number.isSafeInteger(target) && target > places ? Math.min(target, paidSeats) : first;
  const added = Math.max(0, safe - places);
  const amountKobo = added > 0 ? proratedFieldAmountKobo(added, cycle, periodStart, periodEnd) : 0;
  const months = BILLING_CYCLES[cycle].months;
  const ends = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "long", year: "numeric" }).format(new Date(periodEnd));

  return <form action="/api/paystack/field" method="post" className="card space-y-4 bg-white">
    <div><p className="eyebrow">Field staff add-on</p><h2 className="mt-1 text-lg font-bold">{places > 0 ? `${places} field staff place${places === 1 ? "" : "s"} · ${used} in use` : "Add field staff to Pro"}</h2>
      <p className="mt-1 text-sm leading-6 text-muted">Client sites, visit check-in and check-out with notes and photos, and planned visits. {naira(FIELD_ADDON_PRICE)} per field person a month, renewed with your plan. Today you pay only for the days left in this term (until {ends}).</p></div>
    {full ? <p className="rounded-xl bg-paper p-3 text-sm text-muted">Every paid seat already has a field staff place. Add seats first to add more places.</p> : <>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div><label className="label" htmlFor="field-total">New total field staff places</label><input id="field-total" name="field_seats" type="number" min={places + 1} max={paidSeats} value={safe} onChange={(e) => setTarget(Number(e.target.value))} className="input tabular-nums" required />
          <p className="mt-1 text-xs text-muted">Now: {places} · up to {paidSeats} (your paid seats)</p></div>
        <div className="rounded-lg bg-paper px-4 py-3 text-right"><p className="text-xs text-muted">Due now · {added} added place{added === 1 ? "" : "s"}</p><p aria-live="polite" className="text-xl font-extrabold tabular-nums">{naira(amountKobo / 100)}</p></div>
      </div>
      <p className="text-xs leading-5 text-muted">{added} × {naira(FIELD_ADDON_PRICE)} × {months} month{months === 1 ? "" : "s"}, for the part of the term that is left. The places are switched on as soon as Paystack confirms the payment.</p>
      {enabled ? <button className="btn-brand w-full sm:w-auto">Pay with Paystack · {naira(amountKobo / 100)}</button> : <button disabled className="btn-brand w-full sm:w-auto">Paystack payment not available right now</button>}
    </>}
  </form>;
}
