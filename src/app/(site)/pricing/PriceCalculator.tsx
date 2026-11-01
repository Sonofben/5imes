"use client";

import { useState } from "react";
import { naira, FIELD_ADDON_PRICE } from "@/lib/constants";

type P = { id: "basic" | "pro" | "premium"; name: string; pricePerSeat: number; maxSeats?: number | null };
const TERMS = [{ m: 1, l: "Monthly" }, { m: 3, l: "Every 3 months" }, { m: 6, l: "Every 6 months" }, { m: 12, l: "Yearly" }];

export function PriceCalculator({ plans }: { plans: P[] }) {
  const [staff, setStaff] = useState(20);
  const [plan, setPlan] = useState<P["id"]>("pro");
  const [months, setMonths] = useState(1);
  const [field, setField] = useState(0);
  const p = plans.find((x) => x.id === plan) ?? plans[0];
  const seats = Math.max(1, Math.min(100000, Number.isFinite(staff) ? Math.floor(staff) : 1));
  const tooMany = !!p.maxSeats && seats > p.maxSeats;
  const fieldN = plan === "pro" ? Math.max(0, Math.min(seats, Math.floor(field) || 0)) : 0;
  const total = seats * p.pricePerSeat * months + fieldN * FIELD_ADDON_PRICE * months;
  return (
    <div className="grid gap-6 rounded-[1.6rem] border border-line bg-white p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="calc-staff">Number of staff</label><input id="calc-staff" type="number" min={1} max={100000} value={staff} onChange={(e) => setStaff(Number(e.target.value))} className="input tabular-nums" /></div>
        <div><label className="label" htmlFor="calc-plan">Plan</label><select id="calc-plan" value={plan} onChange={(e) => setPlan(e.target.value as P["id"])} className="input">{plans.map((x) => <option key={x.id} value={x.id}>{x.name} · {naira(x.pricePerSeat)}</option>)}</select></div>
        <div><label className="label" htmlFor="calc-term">Pay every</label><select id="calc-term" value={months} onChange={(e) => setMonths(Number(e.target.value))} className="input">{TERMS.map((t) => <option key={t.m} value={t.m}>{t.l}</option>)}</select></div>
        {plan === "pro" && <div><label className="label" htmlFor="calc-field">Field staff (optional)</label><input id="calc-field" type="number" min={0} max={seats} value={field} onChange={(e) => setField(Number(e.target.value))} className="input tabular-nums" /></div>}
      </div>
      <div className="rounded-2xl bg-paper p-5" aria-live="polite">
        <p className="text-sm text-muted">You pay</p>
        {tooMany ? <p className="mt-2 font-semibold text-warn">{p.name} covers up to {p.maxSeats} staff. Choose Pro or Premium.</p> : <>
          <p className="mt-1 text-4xl font-extrabold tabular-nums">{naira(total)}</p>
          <p className="mt-1 text-sm text-muted">{months === 1 ? "every month" : `every ${months} months`}</p>
          <p className="mt-3 text-xs leading-5 text-muted">{seats} staff × {naira(p.pricePerSeat)} × {months}{fieldN ? ` + ${fieldN} field staff × ${naira(FIELD_ADDON_PRICE)} × ${months}` : ""}. Same monthly price on every term.</p>
        </>}
      </div>
    </div>
  );
}
