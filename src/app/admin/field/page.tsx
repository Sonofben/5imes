import Link from "next/link";
import { requireMember, todayIn, timeIn } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { PlanLock } from "@/components/PlanLock";
import { OUTCOMES, VISIT_FLAGS, minutes } from "@/lib/fieldLabels";
import { z } from "zod";
import { cancelVisit, planVisit } from "./actions";

export const dynamic = "force-dynamic";

const Report = z.array(z.object({ member_id: z.string(), name: z.string(), team: z.string().nullable().optional(), planned: z.number(), done: z.number(),
  missed: z.number(), unplanned: z.number(), minutes_on_site: z.number(), flagged: z.number() }));
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Field visits for managers and admins: today's plan against what happened, planning, the visit log and a report. */
export default async function FieldAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, org, isAdmin } = await requireMember({ viewer: true });
  const { data: allowed } = await supabase.rpc("org_has_field", { p_org: org.id });
  if (!allowed) return <PlanLock isAdmin={isAdmin} plan="Premium" title="Field staff is part of Premium, or an add-on for Pro" points={[
    "Keep a list of client sites. Field staff check in when they arrive, with a note, an outcome and a photo.",
    "Plan visits for your team and see planned against done, every day.",
    "Location is checked only at check-in and check-out. Nobody is tracked between visits.",
  ]} />;
  const today = todayIn(org.timezone);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : addDays(today, -6);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : today;
  const [{ data: people }, { data: sites }, { data: todays }, { data: log }, report] = await Promise.all([
    supabase.from("members").select("id,full_name,email,team,is_field").eq("org_id", org.id).eq("status", "active").eq("is_field", true).order("full_name"),
    supabase.from("client_sites").select("id,name").eq("org_id", org.id).eq("active", true).order("name"),
    supabase.from("site_visits").select("id,member_id,site_id,status,planned_date,started_at,ended_at").eq("org_id", org.id).or(`planned_date.eq.${today},status.eq.in_progress`),
    supabase.from("site_visits").select("id,member_id,site_id,status,started_at,ended_at,outcome,note,flags,photo_path,start_distance_m").eq("org_id", org.id).eq("status", "done")
      .gte("started_at", new Date(Date.parse(`${from}T00:00:00Z`) - 86400000).toISOString()).lte("started_at", new Date(Date.parse(`${to}T00:00:00Z`) + 2 * 86400000).toISOString())
      .order("started_at", { ascending: false }).limit(300),
    supabase.rpc("field_report", { p_from: from, p_to: to }),
  ]);
  const name = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email]));
  const site = new Map((sites ?? []).map((s) => [s.id, s.name]));
  const rows = Report.safeParse(report.data).success ? Report.parse(report.data) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="eyebrow">People</p><h1 className="page-heading">Field visits</h1><p className="page-description">Plan visits to client sites and see what happened. Location is checked only when someone checks in or out of a visit.</p></div>
        <Link href="/admin/field/sites" className="btn-ghost">Client sites and field staff</Link>
      </div>
      <Flash {...readFlash(sp)} />

      <section className="card space-y-3">
        <h2 className="font-bold">Today</h2>
        {(people ?? []).length === 0 ? <p className="text-sm text-muted">No field staff yet. Mark people as field staff under <Link className="underline" href="/admin/field/sites">Client sites and field staff</Link>.</p> :
          <div className="overflow-x-auto"><table className="table min-w-[640px]"><thead><tr><th>Person</th><th>Planned</th><th>Done</th><th>Now</th></tr></thead>
            <tbody>{(people ?? []).map((p) => { const mine = (todays ?? []).filter((v) => v.member_id === p.id); const now = mine.find((v) => v.status === "in_progress"); return (
              <tr key={p.id}><td><b>{p.full_name || p.email}</b>{p.team ? <span className="block text-xs text-muted">{p.team}</span> : null}</td>
                <td>{mine.filter((v) => v.planned_date === today).map((v) => <span key={v.id} className={`chip mb-1 mr-1 ${v.status === "done" ? "bg-green-50 text-ok" : v.status === "cancelled" ? "bg-paper text-muted line-through" : "bg-paper text-ink"}`}>{site.get(v.site_id)}{v.status === "planned" && <form action={cancelVisit.bind(null, v.id)} className="ml-1 inline"><button className="text-xs underline" aria-label={`Cancel visit to ${site.get(v.site_id)}`}>×</button></form>}</span>)}</td>
                <td>{(log ?? []).filter((v) => v.member_id === p.id && v.started_at && todayIsLocal(v.started_at, org.timezone, today)).length}</td>
                <td>{now ? <span className="chip bg-green-50 text-ok">At {site.get(now.site_id)} since {timeIn(now.started_at!, org.timezone)}</span> : <span className="text-xs text-muted">Not at a site</span>}</td></tr>); })}</tbody></table></div>}
      </section>

      {(people ?? []).length > 0 && (sites ?? []).length > 0 && <form action={planVisit} className="card space-y-3">
        <h2 className="font-bold">Plan a visit</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="label" htmlFor="p-site">Client site</label><select id="p-site" name="site" required className="input">{(sites ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><label className="label" htmlFor="p-date">Date</label><input id="p-date" name="date" type="date" required min={today} defaultValue={today} className="input" /></div>
          <div><label className="label" htmlFor="p-note">Note (optional)</label><input id="p-note" name="note" maxLength={300} className="input" placeholder="e.g. Collect the order" /></div>
        </div>
        <fieldset><legend className="label">Who should go</legend><div className="flex flex-wrap gap-2">{(people ?? []).map((p) => <label key={p.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-1.5 text-sm"><input type="checkbox" name="member" value={p.id} className="h-4 w-4" />{p.full_name || p.email}</label>)}</div></fieldset>
        <div className="flex justify-end"><button className="btn-primary">Plan visit</button></div>
      </form>}

      <form className="card flex flex-wrap items-end gap-3">
        <div><label className="label" htmlFor="r-from">From</label><input id="r-from" name="from" type="date" defaultValue={from} className="input" /></div>
        <div><label className="label" htmlFor="r-to">To</label><input id="r-to" name="to" type="date" defaultValue={to} className="input" /></div>
        <button className="btn-ghost">Show</button>
      </form>

      <section className="card overflow-x-auto p-0"><table className="table min-w-[720px]">
        <thead><tr><th>Person</th><th>Planned</th><th>Done</th><th>Missed</th><th>Not planned</th><th>Time at sites</th><th>Flagged</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.member_id}><td><b>{r.name}</b></td><td>{r.planned}</td><td>{r.done}</td><td className={r.missed ? "font-bold text-bad" : ""}>{r.missed}</td><td>{r.unplanned}</td><td>{minutes(r.minutes_on_site)}</td><td className={r.flagged ? "text-warn" : ""}>{r.flagged}</td></tr>)}</tbody>
      </table></section>

      <section className="card space-y-3">
        <h2 className="font-bold">Visit log</h2>
        {(log ?? []).length === 0 ? <p className="text-sm text-muted">No visits in this period.</p> :
          <ul className="divide-y divide-line text-sm">{(log ?? []).map((v) => (
            <li key={v.id} className="space-y-1 py-3">
              <div className="flex flex-wrap justify-between gap-2"><span><b>{name.get(v.member_id) ?? "Someone"}</b> at <b>{site.get(v.site_id) ?? "a site"}</b> · {OUTCOMES[v.outcome ?? ""] ?? "Visited"}</span>
                <span className="text-muted">{new Intl.DateTimeFormat("en-NG", { timeZone: org.timezone, weekday: "short", day: "numeric", month: "short" }).format(new Date(v.started_at!))} · {timeIn(v.started_at!, org.timezone)}{v.ended_at ? ` · ${minutes((Date.parse(v.ended_at) - Date.parse(v.started_at!)) / 60000)}` : ""}</span></div>
              {v.note && <p className="text-muted">{v.note}</p>}
              <div className="flex flex-wrap gap-2">{v.flags.map((f) => <span key={f} className="chip bg-amber-50 text-warn">{VISIT_FLAGS[f] ?? f}</span>)}
                {v.photo_path && <a className="text-xs font-semibold underline" href={`/api/field/photo?id=${v.id}`} target="_blank" rel="noreferrer">Photo</a>}</div>
            </li>))}</ul>}
      </section>
    </div>
  );
}

function todayIsLocal(iso: string, tz: string, today: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso)) === today;
}
