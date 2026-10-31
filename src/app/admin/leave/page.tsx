import Link from "next/link";
import { requireMember, todayIn } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { fmtDate, fmtDays } from "@/lib/leave";
import { adminCancelLeave, decideLeave } from "./actions";

export const dynamic = "force-dynamic";

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/**
 * Leave for managers and admins: requests waiting for a decision (managers see their own team,
 * admins everyone), who is off in the next 30 days, and recent decisions.
 */
export default async function LeaveAdminPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, isAdmin, me } = await requireMember({ viewer: true });
  const today = todayIn(org.timezone);
  const until = addDays(today, 30);
  const [{ data: pending }, { data: upcoming }, { data: recent }, { data: people }, { data: types }] = await Promise.all([
    supabase.from("leave_requests").select("id,member_id,leave_type_id,start_date,end_date,days,reason,document_path,created_at").eq("org_id", org.id).eq("status", "pending").order("start_date"),
    supabase.from("leave_requests").select("id,member_id,leave_type_id,start_date,end_date,days").eq("org_id", org.id).eq("status", "approved").lte("start_date", until).gte("end_date", today).order("start_date"),
    supabase.from("leave_requests").select("id,member_id,leave_type_id,start_date,end_date,days,status,decided_at").eq("org_id", org.id).in("status", ["approved", "declined", "cancelled"]).order("decided_at", { ascending: false }).limit(20),
    supabase.from("members").select("id,full_name,email,team").eq("org_id", org.id),
    supabase.from("leave_types").select("id,name").eq("org_id", org.id),
  ]);
  const who = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email]));
  const team = new Map((people ?? []).map((p) => [p.id, p.team]));
  const typeName = new Map((types ?? []).map((t) => [t.id, t.name]));
  const span = (s: string, e: string) => (s === e ? fmtDate(s) : `${fmtDate(s)} to ${fmtDate(e)}`);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="eyebrow">People</p><h1 className="page-heading">Leave</h1><p className="page-description">Approve requests and see who is off. On approved leave nobody is marked absent or late.</p></div>
        {isAdmin && <Link href="/admin/leave/settings" className="btn-ghost">Leave types and allowances</Link>}
      </div>
      <Flash {...readFlash(sp)} />

      <section className="card space-y-3">
        <h2 className="font-bold">Waiting for a decision {pending?.length ? <span className="chip ml-1 bg-amber-50 text-warn">{pending.length}</span> : null}</h2>
        {(pending ?? []).length === 0 ? <p className="text-sm text-muted">Nothing waiting.</p> :
          <ul className="divide-y divide-line">{(pending ?? []).map((r) => (
            <li key={r.id} className="grid gap-3 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
              <div className="space-y-1 text-sm">
                <p><b>{who.get(r.member_id) ?? "Someone"}</b>{team.get(r.member_id) ? <span className="text-muted"> · {team.get(r.member_id)}</span> : null}</p>
                <p>{typeName.get(r.leave_type_id) ?? "Leave"} · {span(r.start_date, r.end_date)} · <b>{fmtDays(Number(r.days))}</b></p>
                {r.reason && <p className="text-muted">“{r.reason}”</p>}
                {r.document_path && <a className="text-xs font-semibold underline" href={`/api/leave/doc?id=${r.id}`} target="_blank" rel="noreferrer">Open the document</a>}
              </div>
              {r.member_id === me.id && me.role !== "owner" ? <p className="text-sm text-muted">Your own request. Another admin or your line manager decides it.</p> :
                <form className="flex flex-wrap items-end gap-2">
                  <div className="min-w-48 flex-1"><label className="label" htmlFor={`n-${r.id}`}>Note (optional)</label><input id={`n-${r.id}`} name="note" maxLength={500} className="input" /></div>
                  <button formAction={decideLeave.bind(null, r.id, true)} className="btn-primary">Approve</button>
                  <button formAction={decideLeave.bind(null, r.id, false)} className="btn-ghost text-bad">Decline</button>
                </form>}
            </li>))}</ul>}
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">Who’s off in the next 30 days</h2>
        {(upcoming ?? []).length === 0 ? <p className="text-sm text-muted">No approved leave coming up.</p> :
          <ul className="divide-y divide-line">{(upcoming ?? []).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <span><b>{who.get(r.member_id)}</b> · {typeName.get(r.leave_type_id)} · {span(r.start_date, r.end_date)}{r.start_date <= today ? <span className="chip ml-2 bg-green-50 text-ok">Off today</span> : null}</span>
              {isAdmin && <form action={adminCancelLeave.bind(null, r.id)}><button className="btn-ghost btn-sm text-bad">Cancel</button></form>}
            </li>))}</ul>}
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">Recent decisions</h2>
        {(recent ?? []).length === 0 ? <p className="text-sm text-muted">None yet.</p> :
          <ul className="divide-y divide-line text-sm">{(recent ?? []).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span><b>{who.get(r.member_id)}</b> · {typeName.get(r.leave_type_id)} · {span(r.start_date, r.end_date)} · {fmtDays(Number(r.days))}</span>
              <span className={`chip ${r.status === "approved" ? "bg-green-50 text-ok" : r.status === "declined" ? "bg-red-50 text-bad" : "bg-paper text-muted"}`}>{r.status === "approved" ? "Approved" : r.status === "declined" ? "Declined" : "Cancelled"}</span>
            </li>))}</ul>}
      </section>
    </div>
  );
}
