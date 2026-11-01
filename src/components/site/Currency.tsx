"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { convertFromNaira, formatMoney, guessCurrency, NAIRA, type DisplayCurrency } from "@/lib/currency";

type Ctx = { list: DisplayCurrency[]; current: DisplayCurrency; set: (code: string) => void };
const CurrencyCtx = createContext<Ctx>({ list: [NAIRA], current: NAIRA, set: () => {} });
const KEY = "5ime.currency";

export function CurrencyProvider({ list, children }: { list: DisplayCurrency[]; children: React.ReactNode }) {
  const [code, setCode] = useState("NGN");
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* storage can be blocked */ }
    const codes = list.map((c) => c.code);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    const next = saved && codes.includes(saved) ? saved : guessCurrency(tz, codes);
    if (next !== "NGN") setCode(next);
  }, [list]);
  const set = (c: string) => { setCode(c); try { localStorage.setItem(KEY, c); } catch { /* ignore */ } };
  const current = list.find((c) => c.code === code) ?? NAIRA;
  return <CurrencyCtx.Provider value={{ list, current, set }}>{children}</CurrencyCtx.Provider>;
}

export function useCurrency() { return useContext(CurrencyCtx); }

/** A naira amount shown in the visitor's chosen currency. */
export function Money({ ngn }: { ngn: number }) {
  const { current } = useCurrency();
  return <>{formatMoney(convertFromNaira(ngn, current), current)}</>;
}

export function CurrencySelect({ className = "" }: { className?: string }) {
  const { list, current, set } = useCurrency();
  if (list.length < 2) return null;
  return (
    <label className={`inline-flex items-center gap-2 text-sm ${className}`}>
      <span className="text-muted">Show prices in</span>
      <select value={current.code} onChange={(e) => set(e.target.value)} className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm font-semibold" aria-label="Currency">
        {list.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.symbol}</option>)}
      </select>
    </label>
  );
}

/** Says that prices outside naira are a guide and billing is in naira. */
export function CurrencyNote() {
  const { current } = useCurrency();
  if (current.code === "NGN") return null;
  return <p className="text-xs leading-5 text-muted">Prices in {current.code} are a guide. You are billed in Nigerian naira (NGN), and your bank converts the amount at its own rate.</p>;
}
