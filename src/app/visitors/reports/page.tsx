import { redirect } from "next/navigation";
import { requireMember, todayIn } from "@/lib/session";
import { friendly } from "@/lib/errors";
import { parseOrNull, VisitorReport } from "@/lib/jsonShapes";
import { reasonLabel, visitTime, zonedIso } from "@/lib/visitors";
import { DataRequestPanel } from "./DataRequestPanel";

export const dynamic = "force-dynamic";

const ACTIONS: Record<string, string> = {
  invited: "Invited", cancelled: "Cancelled", arrived: "Arrived (waiting)", admitted: "Admitted", turned_away: "Turned away",
  signed_out: "Signed out", auto_signed_out: "Signed out automatically", blocked: "Added to blocklist", unblocked: "Removed from blocklist",
  exported: "Exported", settings_changed: "Changed settings", link_changed: "Visitor link", reception_access: "Reception access",
  data_lookup: "Looked up a visitor’s data", data_deleted: "Erased a visitor’s data", retention_purge: "Deleted after retention",
};
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Visitor numbers for a period and, for admins, the audit trail and data requests. Together these are
 * the records a company keeps to show it handles visitor data properly (NDPA).
 */
export default async function VisitorReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, org, isAdmin, isViewer } = await requireMember({ desk: true });
  if (!isViewer) redirect("/visitors");
  const today = todayIn(org.timezone);
  const valid = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  const to = valid(sp.to) ?? today;
  const from = valid(sp.from) ?? `${today.slice(0, 8)}01`;
  const office = sp.office && /^[0-9a-f-]{36}$/.test(sp.office) ? sp.office : null;

  const [{ data: locations }, report, { data: settings }, audit, { data: hosts }] = await Promise.all([
    supabase.from("locations").select("id,name").eq("org_id", org.id).order("name"),
    supabase.rpc("vms_report", { p_from: from, p_to: to, p_location: office }),
    supabase.from("visitor_settings").select("retention_days,photo_retention_days").eq("org_id", org.id).maybeSingle(),
    isAdmin
      ? supabase.from("visitor_audit").select("id,at,actor,member_id,action,detail,visit_id")
          .eq("org_id", org.id).gte("at", zonedIso(from, "00:00", org.timezone)!)
          .lt("at", new Date(new Date(zonedIso(to, "00:00", org.timezone)!).getTime() + 86400000).toISOString())
          .order("at", { ascending: false }).limit(200)
      : Promise.resolve({ data: null }),
    supabase.rpc("vms_hosts"),
  ]);
  const r = report.error ? null : parseOrNull(VisitorReport, report.data, "visitors/report");
  const nameOf = new Map((hosts ?? []).map((h) => [h.id, h.name]));
  const maxDay = Math.max(1, ...(r?.by_weekday ?? [0]));
  const maxReason = Math.max(1, ...(r?.by_reason ?? []).map((x) => x.count));
  const change = r && r.previous_total > 0 ? Math.round(((r.total - r.previous_total) / r.previous_total) * 100) : null;
  const tiles = r ? [
    { label: "Visitors who came in", value: String(r.total), note: change === null ? "" : `${change >= 0 ? "+" : ""}${change}% on the previous period` },
    { label: "Walk-ins", value: r.total ? `${Math.round((r.walk_ins / r.total) * 100)}%` : "—", note: `${r.walk_ins} of ${r.total}` },
    { label: "Average visit", value: r.avg_minutes != null ? fmtMins(r.avg_minutes) : "—", note: r.longest_minutes != null ? `Longest ${fmtMins(r.longest_minutes)}` : "" },
    { label: "Turned away", value: String(r.turned_away), note: `${r.no_shows} invited didn’t come` },
    { label: "Not signed out", value: String(r.auto_signed_out), note: "Closed automatically after 16 h" },
  ] : [];

  return (
    <div className="space-y-5">
      <form className="card flex flex-wrap items-end gap-3">
        <div><label className="label" htmlFor="r-from">From</label><input id="r-from" name="from" type="date" defaultValue={from} className="input" /></div>
        <div><label className="label" htmlFor="r-to">To</label><input id="r-to" name="to" type="date" defaultValue={to} className="input" /></div>
        {(locations ?? []).length > 1 && <div><label className="label" htmlFor="r-office">Office</label>
          <select id="r-office" name="office" defaultValue={office ?? ""} className="input"><option value="">All offices</option>{(locations ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>}
        <button className="btn-primary">Show</button>
        <a href={`/visitors/export?${new URLSearchParams({ from, to })}`} className="btn-ghost">Download visitor log (CSV)</a>
      </form>

      {report.error && <p className="card text-bad">{friendly(report.error, "visitors/report")}</p>}
      {r && <>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          {tiles.map((t) => <div key={t.label} className="card space-y-1 p-4"><p className="text-sm text-muted">{t.label}</p><p className="text-3xl font-extrabold">{t.value}</p>{t.note && <p className="text-xs text-muted">{t.note}</p>}</div>)}
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <section className="card space-y-3">
            <h2 className="font-bold">Visitors by weekday</h2>
            <div className="flex h-48 items-end gap-3 border-b border-line px-1" role="img" aria-label={r.by_weekday.map((c, i) => `${WEEKDAYS[i]} ${c}`).join(", ")}>
              {r.by_weekday.map((c, i) => <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1 self-stretch">
                <span className="text-xs font-semibold">{c}</span>
                <div className="w-full rounded-t-md bg-ink" style={{ height: `${Math.max(2, (c / maxDay) * 150)}px` }} />
              </div>)}
            </div>
            <div className="flex gap-3 px-1 text-xs text-muted">{WEEKDAYS.map((d) => <span key={d} className="flex-1 text-center">{d}</span>)}</div>
          </section>
          <section className="card space-y-3">
            <h2 className="font-bold">Reason for visit</h2>
            {r.by_reason.length === 0 ? <p className="text-sm text-muted">No visits in this period.</p> : r.by_reason.map((x) => (
              <div key={x.reason} className="space-y-1 text-sm">
                <div className="flex justify-between"><span>{reasonLabel(x.reason)}</span><b>{x.count}</b></div>
                <div className="h-2 rounded-full bg-paper"><div className="h-2 rounded-full bg-ink" style={{ width: `${(x.count / maxReason) * 100}%` }} /></div>
              </div>))}
            {r.top_hosts.length > 0 && <><h3 className="pt-2 text-sm font-bold">Most visited</h3>
              <ul className="space-y-1 text-sm">{r.top_hosts.map((h) => <li key={h.name} className="flex justify-between"><span>{h.name}</span><b>{h.count}</b></li>)}</ul></>}
          </section>
        </div>
      </>}

      <section className="card space-y-1 text-sm">
        <h2 className="font-bold">Retention</h2>
        <p className="text-muted">Visitor details are kept <b className="text-ink">{settings?.retention_days ?? 90} days</b> and photos <b className="text-ink">{settings?.photo_retention_days ?? 30} days</b>, then deleted automatically. The audit trail is kept 2 years and never contains visitor names. {isAdmin && "Change this under Settings."}</p>
      </section>

      {isAdmin && <>
        <section className="card space-y-3">
          <div><h2 className="font-bold">Audit trail</h2><p className="text-sm text-muted">Every action on visitor data in this period: who, what and when. It can’t be edited.</p></div>
          <div className="overflow-x-auto"><table className="table min-w-[680px]">
            <thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
            <tbody>{(audit.data ?? []).length === 0 ? <tr><td colSpan={4} className="text-muted">Nothing recorded in this period.</td></tr> : (audit.data ?? []).map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap text-xs">{visitTime(a.at, org.timezone)}</td>
                <td className="text-sm">{a.actor === "staff" ? nameOf.get(a.member_id ?? "") ?? "A colleague" : a.actor === "visitor" ? "The visitor" : a.actor === "tablet" ? "Reception tablet" : "Automatic"}</td>
                <td className="text-sm">{ACTIONS[a.action] ?? a.action}</td>
                <td className="text-xs text-muted">{a.detail ?? ""}</td>
              </tr>))}</tbody></table></div>
          {(audit.data ?? []).length === 200 && <p className="text-xs text-muted">Showing the latest 200. Choose a shorter period to see more.</p>}
        </section>
        <DataRequestPanel />
      </>}
    </div>
  );
}

function fmtMins(m: number) {
  return m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`;
}
