"use client";

import { useState } from "react";
import { BILLING_CYCLES, proratedSeatAmountKobo, type BillingCycleId } from "@/lib/billing";
import { naira } from "@/lib/constants";

export function SeatIncreaseCard({
  paidSeats, assignedSeats, pricePerSeat, cycle, periodStart, periodEnd, enabled,
}: {
  paidSeats: number;
  assignedSeats: number;
  pricePerSeat: number;
  cycle: BillingCycleId;
  periodStart: string;
  periodEnd: string;
  enabled: boolean;
}) {
  const firstAvailable = Math.max(paidSeats, assignedSeats) + 1;
  const [targetSeats, setTargetSeats] = useState(firstAvailable);
  const safeSeats = Number.isSafeInteger(targetSeats) && targetSeats >= firstAvailable ? targetSeats : firstAvailable;
  const addedSeats = safeSeats - paidSeats;
  const amountKobo = proratedSeatAmountKobo(pricePerSeat, addedSeats, cycle, periodStart, periodEnd);
  const months = BILLING_CYCLES[cycle].months;

  return <form action="/api/paystack/seats" method="post" className="card space-y-4 border-brand/20 bg-white">
    <div><p className="eyebrow">Mid-cycle seat addition</p><h2 className="mt-1 text-lg font-bold">Add seats now</h2><p className="mt-1 text-sm leading-6 text-muted">Pay only for the added seats, prorated by the exact time left in this {months}-month billing period. Your current renewal date stays the same.</p></div>
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div><label className="label" htmlFor="additional-seat-total">New total paid seats</label><input id="additional-seat-total" name="seats" type="number" min={firstAvailable} max={10000} value={safeSeats} onChange={(event) => setTargetSeats(Number(event.target.value))} className="input tabular-nums" required/><p className="mt-1 text-xs text-muted">Current paid capacity: {paidSeats}; active + invited: {assignedSeats}</p></div>
      <div className="rounded-lg bg-paper px-4 py-3 text-right"><p className="text-xs text-muted">Due now · {addedSeats} added seat{addedSeats === 1 ? "" : "s"}</p><p aria-live="polite" className="text-xl font-extrabold tabular-nums">{naira(amountKobo / 100)}</p></div>
    </div>
    <p className="text-xs leading-5 text-muted">From the next renewal, Paystack charges the full {safeSeats}-seat amount of {naira(pricePerSeat * safeSeats)} × {months} months. No multi-month discounts. The server recalculates the exact remaining-time proration to the nearest kobo; Paystack confirms the final charge.</p>
    <button disabled={!enabled} className="btn-brand w-full sm:w-auto">{enabled ? `Pay prorated amount · ${naira(amountKobo / 100)}` : "Paystack setup required"}</button>
  </form>;
}
