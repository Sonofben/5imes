import Link from "next/link";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { requireMember, todayIn } from "@/lib/session";
import { LeaveBalances, parseOrNull } from "@/lib/jsonShapes";
import { fmtDate, fmtDays } from "@/lib/leave";
import { cancelLeave, requestLeave } from "./actions";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: "Waiting for approval", tone: "bg-amber-50 text-warn" },
  approved: { label: "Approved", tone: "bg-green-50 text-ok" },
  declined: { label: "Declined", tone: "bg-red-50 text-bad" },
  cancelled: { label: "Cancelled", tone: "bg-paper text-muted" },
};

/** A person's leave: balances, a request form and their requests. */
export default async function MyLeavePage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, me, org } = await requireMember();
  const today = todayIn(org.timezone);
  const [{ data: balRaw }, { data: types }, { data: rows }] = await Promise.all([
    supabase.rpc("my_leave_balances"),
    supabase.from("leave_types").select("id,name,document_after_days,counts_weekends,paid").eq("org_id", org.id).eq("active", true).order("sort").order("name"),
    supabase.from("leave_requests").select("id,start_date,end_date,days,status,reason,decision_note,document_path,leave_type_id").eq("member_id", me.id).order("start_date", { ascending: false }).limit(30),
  ]);
  const balances = parseOrNull(LeaveBalances, balRaw, "app/leave/balances") ?? [];
  const offered = (types ?? []).filter((t) => balances.some((b) => b.type_id === t.id));
  const nameOf = new Map((types ?? []).map((t) => [t.id, t.name]));
  const docNote = offered.filter((t) => t.document_after_days != null).map((t) => `${t.name}: longer than ${t.document_after_days} day${t.document_after_days === 1 ? "" : "s"}`);

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-6 sm:px-6">
      <div><Link href="/app" className="text-sm text-muted underline">Back to check in</Link><h1 className="page-heading mt-1">My leave</h1></div>
      <Flash {...readFlash(sp)} />

      <section className="grid grid-cols-2 gap-3">
        {balances.map((b) => (
          <div key={b.type_id} className="card space-y-1 p-4">
            <p className="text-xs font-semibold text-muted">{b.name}</p>
            <p className="text-2xl font-extrabold">{b.remaining == null ? "No limit" : fmtDays(b.remaining)}</p>
            <p className="text-xs text-muted">{b.entitlement == null ? `${fmtDays(b.used)} taken` : `left of ${fmtDays(b.entitlement + b.carried)}`}{b.pending > 0 ? ` · ${fmtDays(b.pending)} waiting` : ""}</p>
            {b.carried > 0 && <p className="text-xs text-muted">Includes {fmtDays(b.carried)} carried over{b.carried_expires ? `, use by ${fmtDate(b.carried_expires)}` : ""}</p>}
          </div>
        ))}
      </section>

      <form action={requestLeave} className="card space-y-3">
        <h2 className="font-bold">Ask for leave</h2>
        <div><label className="label" htmlFor="l-type">Type of leave</label>
          <select id="l-type" name="type" required className="input">{offered.map((t) => <option key={t.id} value={t.id}>{t.name}{t.paid ? "" : " (unpaid)"}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="l-start">First day</label><input id="l-start" name="start" type="date" required min={today} className="input" /></div>
          <div><label className="label" htmlFor="l-end">Last day</label><input id="l-end" name="end" type="date" className="input" /><p className="mt-1 text-xs text-muted">Leave empty for one day.</p></div>
        </div>
        <div><label className="label" htmlFor="l-reason">Note for your manager (optional)</label><textarea id="l-reason" name="reason" rows={2} maxLength={500} className="input" /></div>
        <div><label className="label" htmlFor="l-doc">Supporting document (optional)</label><input id="l-doc" name="document" type="file" accept="application/pdf,image/jpeg,image/png" className="input py-2" />
          {docNote.length > 0 && <p className="mt-1 text-xs text-muted">Needed for {docNote.join("; ")}. PDF, JPG or PNG up to 5 MB.</p>}</div>
        <p className="text-xs text-muted">Only your working days count. Weekends, days off and holidays are skipped automatically.</p>
        <button className="btn-primary w-full">Send request</button>
      </form>

      <section className="card space-y-3">
        <h2 className="font-bold">My requests</h2>
        {(rows ?? []).length === 0 ? <p className="text-sm text-muted">No leave yet.</p> :
          <ul className="divide-y divide-line">{(rows ?? []).map((r) => {
            const s = STATUS[r.status] ?? STATUS.pending;
            const canCancel = r.status === "pending" || (r.status === "approved" && r.start_date > today);
            return <li key={r.id} className="space-y-1 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><b>{nameOf.get(r.leave_type_id) ?? "Leave"}</b><span className={`chip ${s.tone}`}>{s.label}</span></div>
              <p className="text-muted">{r.start_date === r.end_date ? fmtDate(r.start_date) : `${fmtDate(r.start_date)} to ${fmtDate(r.end_date)}`} · {fmtDays(Number(r.days))}</p>
              {r.decision_note && <p className="text-xs text-muted">Note: {r.decision_note}</p>}
              <div className="flex gap-3">
                {r.document_path && <a className="text-xs font-semibold underline" href={`/api/leave/doc?id=${r.id}`} target="_blank" rel="noreferrer">Document</a>}
                {canCancel && <form action={cancelLeave.bind(null, r.id)}><button className="text-xs font-semibold text-bad underline">Cancel</button></form>}
              </div>
            </li>;
          })}</ul>}
      </section>

    </main>
  );
}
