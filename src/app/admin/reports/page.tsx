import { requireMember, todayIn, timeIn, type Subscription } from "@/lib/session";
import { loadReport, shiftDate, hours } from "@/lib/reports";
import { FLAG_LABELS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, isAdmin } = await requireMember({ viewer: true });
  const today = todayIn(org.timezone);

  const { data: sub } = isAdmin
    ? await supabase.from("subscriptions").select("plan").eq("org_id", org.id).maybeSingle<Pick<Subscription, "plan">>()
    : { data: null };
  const minDate = sub?.plan === "basic" ? shiftDate(today, -30) : "2000-01-01";

  const valid = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
  let from = valid(sp.from) ?? shiftDate(today, -6);
  const to = valid(sp.to) ?? today;
  const clipped = from < minDate;
  if (clipped) from = minDate;

  const { events, people, locName, summary } = await loadReport(supabase, org.id, from, to);
  const rows = [...people.values()]
    .map((p) => ({ p, s: summary.get(p.id) }))
    .filter((r) => r.s)
    .sort((a, b) => (a.p.full_name || a.p.email).localeCompare(b.p.full_name || b.p.email));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Attendance analytics</p>
          <h1 className="page-heading">Reports</h1>
          <p className="text-sm text-muted">{events.length} check-ins/outs between {from} and {to}</p>
        </div>
        <form className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor="report-from">From</label>
            <input id="report-from" type="date" name="from" defaultValue={from} min={minDate} className="input py-1.5" />
          </div>
          <div>
            <label className="label" htmlFor="report-to">To</label>
            <input id="report-to" type="date" name="to" defaultValue={to} className="input py-1.5" />
          </div>
          <button className="btn-primary">Show</button>
          <a href={`/admin/reports/export?from=${from}&to=${to}`} className="btn-ghost">Download CSV</a>
        </form>
      </div>
      {clipped && <p className="text-sm text-warn">The Basic plan keeps 30 days of history. Upgrade to Pro for unlimited history.</p>}

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Days present</th>
              <th>Office</th>
              <th>Home</th>
              <th>Late</th>
              <th>Flagged days</th>
              <th>Hours</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="text-muted">No attendance in this period.</td></tr>
            )}
            {rows.map(({ p, s }) => (
              <tr key={p.id}>
                <td>
                  <div className="font-medium">{p.full_name || p.email}</div>
                  <div className="text-xs text-muted">{p.team || p.email}</div>
                </td>
                <td>{s!.daysPresent}</td>
                <td>{s!.office}</td>
                <td>{s!.home}</td>
                <td className={s!.late ? "text-warn" : ""}>{s!.late}</td>
                <td className={s!.flagged ? "text-brand" : ""}>{s!.flagged}</td>
                <td>{hours(s!.minutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="card">
        <summary className="cursor-pointer font-bold">Attendance events ({events.length})</summary>
        <p className="mt-2 text-xs text-muted">Showing the latest 500 events on screen. Download CSV to get the complete selected range.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="table">
            <thead>
              <tr><th>Date</th><th>Time</th><th>Person</th><th>Action</th><th>Where</th><th>Distance</th><th>GPS ±</th><th>Flags</th></tr>
            </thead>
            <tbody>
              {[...events].reverse().slice(0, 500).map((e) => {
                const p = people.get(e.member_id);
                return (
                  <tr key={e.id}>
                    <td>{e.local_date}</td>
                    <td>{timeIn(e.at, org.timezone)}</td>
                    <td>{p?.full_name || p?.email}</td>
                    <td>{e.kind === "in" ? "In" : "Out"}</td>
                    <td>{e.location_type === "office" ? locName.get(e.location_id ?? "") ?? "Office" : e.location_type === "home" ? "Home" : "Outside"}</td>
                    <td>{e.distance_m != null ? `${Math.round(e.distance_m)}m` : "—"}</td>
                    <td>{e.accuracy_m != null ? `${Math.round(e.accuracy_m)}m` : "—"}</td>
                    <td className="text-xs text-warn">{e.flags.map((f) => FLAG_LABELS[f] ?? f).join(", ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
