import Link from "next/link";
import { requireConsole, naira, fmtDateTime } from "@/lib/console";
import { Bars } from "../Bars";
import { friendly } from "@/lib/errors";
import { parseOrNull, ConsoleRevenue } from "@/lib/jsonShapes";

export const dynamic = "force-dynamic";


export default async function RevenuePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; status?: string; q?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireConsole();
  const filters = { p_from: sp.from || null, p_to: sp.to || null, p_status: sp.status || null, p_search: sp.q || null };
  const [{ data: revData, error }, { data: payData }] = await Promise.all([supabase.rpc("console_revenue"), supabase.rpc("console_payments", filters)]);
  if (error || !revData) return <p className="card text-bad">{(error ? friendly(error, "console/revenue") : "No revenue data.")}</p>;
  const r = parseOrNull(ConsoleRevenue, revData, "console/revenue");
  if (!r) return <p className="card text-bad">This data came back in an unexpected shape, so it isn’t shown. The details were logged.</p>;
  const payments = (payData ?? []);
  const tiles: [string, string | number][] = [
    ["This month", naira(r.this_month_kobo)], ["Last month", naira(r.last_month_kobo)], ["Last 12 months", naira(r.year_kobo)], ["All time", naira(r.all_time_kobo)],
    ["Monthly run rate", naira(r.monthly_run_rate_kobo)], ["Paying companies", r.paying_companies], ["Pending payments", r.pending_count], ["Failed (30 days)", r.failed_count_30d],
  ];
  const months = r.by_month.map((m) => ({ key: m.month, value: Math.round(m.kobo / 100), title: m.month }));
  const query = new URLSearchParams(Object.entries({ from: sp.from ?? "", to: sp.to ?? "", status: sp.status ?? "", q: sp.q ?? "" }).filter(([, v]) => v));
  return (
    <div className="space-y-6">
      <div><h1 className="page-heading">Revenue & payments</h1><p className="page-description">Confirmed payments only. Monthly run rate = seats paid × current monthly price for every company in a paid term.</p></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{tiles.map(([l, v]) => <div key={l} className="card p-4"><p className="text-xs text-muted">{l}</p><p className="mt-1 text-2xl font-bold tabular-nums">{v}</p></div>)}</div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card space-y-2 lg:col-span-2"><h2 className="font-bold">Revenue by month (₦)</h2>{months.length ? <Bars label="Revenue by month" unit="naira" data={months} /> : <p className="text-sm text-muted">No confirmed payments yet.</p>}</section>
        <section className="card space-y-3 text-sm"><h2 className="font-bold">Last 12 months by plan</h2>
          {Object.entries(r.by_plan).map(([k, v]) => <p key={k} className="flex justify-between"><span className="capitalize">{k}</span><b>{naira(v)}</b></p>)}
          <h2 className="pt-2 font-bold">By payment provider</h2>
          {Object.entries(r.by_provider).map(([k, v]) => <p key={k} className="flex justify-between"><span className="capitalize">{k}</span><b>{naira(v)}</b></p>)}
          {!Object.keys(r.by_plan).length && <p className="text-muted">Nothing yet.</p>}</section>
      </div>
      <section className="space-y-3">
        <form className="flex flex-wrap items-end gap-2">
          <div><label className="label" htmlFor="rf">From</label><input id="rf" name="from" type="date" defaultValue={sp.from} className="input" /></div>
          <div><label className="label" htmlFor="rt">To</label><input id="rt" name="to" type="date" defaultValue={sp.to} className="input" /></div>
          <div><label className="label" htmlFor="rs">Status</label><select id="rs" name="status" defaultValue={sp.status ?? ""} className="input"><option value="">All</option><option value="applied">Confirmed</option><option value="pending">Pending</option><option value="failed">Failed</option></select></div>
          <div><label className="label" htmlFor="rq">Company or reference</label><input id="rq" name="q" defaultValue={sp.q} className="input" /></div>
          <button className="btn-primary">Filter</button>
          <Link className="btn-ghost" href={`/console/revenue/export?${query}`}>Download CSV</Link>
        </form>
        <div className="card overflow-x-auto p-0"><table className="table min-w-[900px]">
          <thead><tr><th>Date</th><th>Company</th><th>What</th><th>Via</th><th>Amount</th><th>Status</th><th>Reference</th></tr></thead>
          <tbody>{payments.length === 0 ? <tr><td colSpan={7} className="text-muted">No payments match.</td></tr> : payments.map((p) => <tr key={p.reference}>
            <td className="text-xs">{fmtDateTime(p.created_at)}</td>
            <td><Link className="underline" href={`/console/companies/${p.org_id}`}>{p.company}</Link></td>
            <td className="text-xs">{p.kind === "seat_increase" ? `Seats → ${p.seats}` : `${p.plan} · ${p.seats} seats · ${p.months} mo`}{p.note ? ` · ${p.note}` : ""}</td>
            <td className="capitalize">{p.provider}</td><td className="tabular-nums">{naira(p.amount_kobo)}</td>
            <td><span className={`chip ${p.status === "applied" ? "bg-green-50 text-ok" : p.status === "pending" ? "bg-amber-50 text-warn" : "bg-red-50 text-bad"}`}>{p.status === "applied" ? "confirmed" : p.status}</span></td>
            <td className="font-mono text-xs">{p.reference}</td>
          </tr>)}</tbody></table></div>
      </section>
    </div>
  );
}
