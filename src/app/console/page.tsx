import Link from "next/link";
import { requireConsole, naira, fmtDate } from "@/lib/console";

export const dynamic = "force-dynamic";

type Overview = { companies: number; trialing: number; paying: number; expired: number; suspended: number; seats_used: number; seats_paid: number; revenue_month_kobo: number; new_this_week: number; ending_soon: number };
type Row = { id: string; name: string; domain: string; status: string; trial_ends_at: string | null; current_period_end: string | null };

export default async function ConsoleOverview() {
  const { supabase, role } = await requireConsole();
  const [{ data: o, error }, { data: companies }] = await Promise.all([
    supabase.rpc("console_overview"),
    supabase.rpc("console_companies", { p_search: null }),
  ]);
  if (error) return <p className="card text-bad">{error.message}</p>;
  const ov = o as Overview;
  const soon = ((companies ?? []) as Row[]).map((c) => ({ ...c, ends: c.status === "trialing" ? c.trial_ends_at : c.current_period_end }))
    .filter((c) => c.ends && new Date(c.ends).getTime() > Date.now() && new Date(c.ends).getTime() < Date.now() + 7 * 86400000)
    .sort((a, b) => new Date(a.ends!).getTime() - new Date(b.ends!).getTime());
  const tiles = [
    ["Companies", ov.companies], ["On trial", ov.trialing], ["Paying", ov.paying], ["Expired", ov.expired],
    ["Suspended", ov.suspended], ["Seats in use", ov.seats_used], ["Seats paid", ov.seats_paid],
    ["Revenue this month", naira(ov.revenue_month_kobo)], ["New this week", ov.new_this_week], ["Ending in 7 days", ov.ending_soon],
  ] as const;
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between"><div><p className="eyebrow">Signed in as {role}</p><h1 className="page-heading">Overview</h1></div><Link href="/console/companies" className="btn-primary btn-sm">All companies</Link></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{tiles.map(([label, value]) => <div key={label} className="card p-4"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p></div>)}</div>
      <section className="card">
        <h2 className="font-bold">Follow up: trials and terms ending in 7 days</h2>
        {soon.length === 0 ? <p className="mt-2 text-sm text-muted">Nothing ending this week.</p> : (
          <ul className="mt-2 divide-y divide-line text-sm">{soon.map((c) => <li key={c.id} className="flex justify-between py-2"><Link className="font-medium underline" href={`/console/companies/${c.id}`}>{c.name}</Link><span className="text-muted">{c.status === "trialing" ? "Trial" : "Paid term"} ends {fmtDate(c.ends)}</span></li>)}</ul>
        )}
      </section>
    </div>
  );
}
