import { naira } from "./constants";

export type DealRow = { kind: string; percent_off: number | null; amount_off_kobo: number | null; price_per_seat: number | null; plan: string | null;
  ends_at: string | null; max_uses: number | null; uses: number };

/** One line describing a price deal, e.g. "20% off any plan until 1 Nov 2028". */
export function describeDeal(d: DealRow, fmtDate: (s: string) => string) {
  const what = d.kind === "percent" ? `${Number(d.percent_off)}% off` : d.kind === "amount" ? `${naira(Number(d.amount_off_kobo) / 100)} off each payment`
    : `${naira(Number(d.price_per_seat))} per staff a month`;
  const plan = d.plan ? `on ${d.plan[0].toUpperCase()}${d.plan.slice(1)}` : "on any plan";
  const until = [d.ends_at ? `until ${fmtDate(d.ends_at)}` : "", d.max_uses ? `for ${d.max_uses - d.uses} more payment${d.max_uses - d.uses === 1 ? "" : "s"}` : ""].filter(Boolean).join(", ");
  return `${what} ${plan}${until ? `, ${until}` : ", with no end date"}`;
}
