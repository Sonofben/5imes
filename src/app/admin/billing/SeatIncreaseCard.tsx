"use client";

import { useState } from "react";
import { BILLING_CYCLES, billingAmountKobo, type BillingCycleId } from "@/lib/billing";
import { naira } from "@/lib/constants";

export function SeatIncreaseCard({
  paidSeats, assignedSeats, pricePerSeat, cycle, enabled, providers = ["paystack"],
}: {
  providers?: ("paystack" | "monnify")[];
  paidSeats: number;
  assignedSeats: number;
  pricePerSeat: number;
  cycle: BillingCycleId;
  enabled: boolean;
}) {
  const firstAvailable = Math.max(paidSeats, assignedSeats) + 1;
  const [targetSeats, setTargetSeats] = useState(firstAvailable);
  const safeSeats = Number.isSafeInteger(targetSeats) && targetSeats >= firstAvailable ? targetSeats : firstAvailable;
  const addedSeats = safeSeats - paidSeats;
  const amountKobo = billingAmountKobo(pricePerSeat, addedSeats, cycle);
  const months = BILLING_CYCLES[cycle].months;

  return <form action="/api/paystack/seats" method="post" className="card space-y-4 border-brand/20 bg-white">
    <input type="hidden" name="kind" value="seats" />
    <div><p className="eyebrow">Add people</p><h2 className="mt-1 text-lg font-bold">Add seats now</h2><p className="mt-1 text-sm leading-6 text-muted">Each added seat costs the full {naira(pricePerSeat)} per person per month for your {months}-month term. Your term end date stays the same.</p></div>
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div><label className="label" htmlFor="additional-seat-total">New total paid seats</label><input id="additional-seat-total" name="seats" type="number" min={firstAvailable} max={10000} value={safeSeats} onChange={(event) => setTargetSeats(Number(event.target.value))} className="input tabular-nums" required/><p className="mt-1 text-xs text-muted">Current paid capacity: {paidSeats}; active + invited: {assignedSeats}</p></div>
      <div className="rounded-lg bg-paper px-4 py-3 text-right"><p className="text-xs text-muted">Due now · {addedSeats} added seat{addedSeats === 1 ? "" : "s"}</p><p aria-live="polite" className="text-xl font-extrabold tabular-nums">{naira(amountKobo / 100)}</p></div>
    </div>
    <p className="text-xs leading-5 text-muted">{addedSeats} seat{addedSeats === 1 ? "" : "s"} × {naira(pricePerSeat)} × {months} month{months === 1 ? "" : "s"}. No discounts and no part-term pricing.</p>
    {!enabled ? <button disabled className="btn-brand w-full sm:w-auto">Online payment not set up</button> : <div className="flex flex-wrap gap-2">
      {providers.includes("monnify") && <button formAction="/api/monnify/checkout" className="btn-brand w-full sm:w-auto">Pay with Moniepoint · {naira(amountKobo / 100)}</button>}
      {providers.includes("paystack") && <button formAction="/api/paystack/seats" className={`${providers.includes("monnify") ? "btn-ghost" : "btn-brand"} w-full sm:w-auto`}>Pay with Paystack · {naira(amountKobo / 100)}</button>}
    </div>}
  </form>;
}
