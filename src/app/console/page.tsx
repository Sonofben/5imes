import Link from "next/link";
import { requireConsole, naira, fmtDate, ROLE_LABELS } from "@/lib/console";
import { Bars } from "./Bars";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { friendly } from "@/lib/errors";
import { parseOrNull, ConsoleHealth, ConsoleOverview, ConsoleRevenue } from "@/lib/jsonShapes";

export const dynamic = "force-dynamic";


export default async function GlobalAdminOverview({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const flash = readFlash(await searchParams);
  const { supabase, role } = await requireConsole();
  const [ovRes, healthRes, revRes] = await Promise.all([
    supabase.rpc("console_overview"), supabase.rpc("console_health"), supabase.rpc("console_revenue"),
  ]);
  if (ovRes.error || !ovRes.data) {
    return (
      <div className="space-y-4">
        <h1 className="page-heading">Overview</h1>
        <p className="card text-bad">Global Admin data lookup failed. {(ovRes.error ? friendly(ovRes.error, "console") : "No data returned.")}</p>
        <p className="text-sm text-muted">If you just deployed, check that every migration up to 0012 has been run in Supabase.</p>
      </div>
    );
  }
  const ov = parseOrNull(ConsoleOverview, ovRes.data, "console/overview");
  if (!ov) return <p className="card text-bad">This data came back in an unexpected shape, so it isn’t shown. The details were logged.</p>;
  const h = parseOrNull(ConsoleHealth, healthRes.data, "console/health");
  const rev = parseOrNull(ConsoleRevenue, revRes.data, "console/revenue");
  const tiles: [string, string | number, string?][] = [
    ["Companies", ov.companies, "/console/companies"], ["On trial", ov.trialing], ["Paying", ov.paying], ["Expired", ov.expired],
    ["Suspended", ov.suspended], ["Active companies (7 days)", h?.companies_active_7d ?? "—"], ["People checking in (7 days)", h?.people_active_7d ?? "—"],
    ["Check-ins today", h?.checkins_today ?? "—"], ["Revenue this month", naira(rev?.this_month_kobo ?? ov.revenue_month_kobo), "/console/revenue"],
    ["Monthly run rate", rev ? naira(rev.monthly_run_rate_kobo) : "—", "/console/revenue"],
  ];

  return (
    <div className="space-y-6">
      <Flash {...flash} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="eyebrow">Signed in as {role ? ROLE_LABELS[role] : "—"}</p><h1 className="page-heading">Platform overview</h1></div>
        <Link href="/console/companies" className="btn-primary btn-sm">All companies</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map(([label, value, href]) => {
          const body = <><p className="text-xs text-muted">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p></>;
          return href ? <Link key={label} href={href} className="card p-4 hover:border-ink/30">{body}</Link> : <div key={label} className="card p-4">{body}</div>;
        })}
      </div>

      {h && <div className="grid gap-4 lg:grid-cols-2">
        <section className="card space-y-2"><h2 className="font-bold">Check-ins per day (last 14 days)</h2>
          <Bars label="Check-ins per day" unit="check-ins" data={h.checkins_by_day.map((d) => ({ key: d.day, value: d.checkins, title: fmtDate(d.day) }))} /></section>
        <section className="card space-y-2"><h2 className="font-bold">New companies per week (last 12 weeks)</h2>
          <Bars label="New companies per week" unit="companies" data={h.signups_by_week.map((w) => ({ key: w.week, value: w.companies, title: fmtDate(w.week) }))} /></section>
      </div>}

      <section className="card space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">Companies that need attention</h2><span className="chip bg-amber-50 text-warn">{h?.at_risk.length ?? 0}</span></div>
        {!h || h.at_risk.length === 0 ? <p className="text-sm text-muted">Nothing needs attention.</p> : (
          <ul className="divide-y divide-line text-sm">{h.at_risk.map((c) => (
            <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span><Link className="font-medium underline" href={`/console/companies/${c.id}`}>{c.name}</Link> <span className="text-muted">@{c.domain}</span></span>
              <span className="text-warn">{c.reason}<span className="text-muted"> · last check-in {fmtDate(c.last_check_in)}</span></span>
            </li>))}</ul>
        )}
      </section>
      {rev && (rev.pending_count > 0 || rev.failed_count_30d > 0) && (
        <p className="card text-sm text-warn">{rev.pending_count} payment{rev.pending_count === 1 ? "" : "s"} pending · {rev.failed_count_30d} failed in the last 30 days. <Link href="/console/revenue" className="underline">Open Revenue</Link></p>
      )}
    </div>
  );
}
