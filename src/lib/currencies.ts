import "server-only";
import { NAIRA, type DisplayCurrency } from "./currency";

let cache: { at: number; value: DisplayCurrency[] } | null = null;

/** Active display currencies from Global Admin (cached for five minutes). Falls back to naira only. */
export async function loadCurrencies(): Promise<DisplayCurrency[]> {
  if (cache && Date.now() - cache.at < 300_000) return cache.value;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [NAIRA];
  const { createClient } = await import("@supabase/supabase-js");
  const { data } = await createClient(url, key, { auth: { persistSession: false } }).rpc("public_currencies");
  const list = Array.isArray(data) ? (data as Record<string, unknown>[]).map((c) => ({
    code: String(c.code), name: String(c.name), symbol: String(c.symbol), ngnPerUnit: Number(c.ngnPerUnit), markupPct: Number(c.markupPct),
  })).filter((c) => /^[A-Z]{3}$/.test(c.code) && c.ngnPerUnit > 0) : [];
  const value = list.some((c) => c.code === "NGN") ? list : [NAIRA, ...list];
  if (list.length) cache = { at: Date.now(), value };
  return value;
}
