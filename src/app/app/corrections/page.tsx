import Link from "next/link";
import { Flash } from "@/components/Flash";
import { requireMember, timeIn, todayIn } from "@/lib/session";
import { submitAttendanceCorrection } from "./actions";

export const dynamic = "force-dynamic";

type RequestRow = {
  id: string;
  work_date: string;
  requested_in_at: string | null;
  requested_out_at: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  submitted_at: string;
  reviewed_at: string | null;
  review_note: string | null;
};
type AuditRow = { id: string; request_id: string; actor_label: string; event_type: string; occurred_at: string; details: Record<string, unknown> };

function localDateTime(value: string, timezone: string) {
  return `${new Intl.DateTimeFormat("en-NG", { timeZone: timezone, day: "numeric", month: "short", year: "numeric" }).format(new Date(value))} · ${timeIn(value, timezone)}`;
}

function auditTimes(details: Record<string, unknown>, timezone: string) {
  const output: { label: string; at: string }[] = [];
  const add = (label: string, value: unknown) => {
    if (typeof value === "string" && !Number.isNaN(new Date(value).getTime())) output.push({ label, at: localDateTime(value, timezone) });
  };
  add("Requested check-in", details.requested_in_at);
  add("Requested check-out", details.requested_out_at);
  const before = details.before as Record<string, { at?: string } | null> | undefined;
  const after = details.after as Record<string, { at?: string } | null> | undefined;
  add("Previous check-in", before?.in?.at);
  add("Previous check-out", before?.out?.at);
  add("Approved check-in", after?.in?.at);
  add("Approved check-out", after?.out?.at);
  return output;
}

export default async function EmployeeCorrectionsPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, me, org } = await requireMember();
  const { data: rows } = await supabase.from("attendance_correction_requests")
    .select("id,work_date,requested_in_at,requested_out_at,reason,status,submitted_at,reviewed_at,review_note")
    .eq("member_id", me.id).order("submitted_at", { ascending: false }).limit(20);
  const requests = (rows ?? []) as RequestRow[];
  const ids = requests.map((request) => request.id);
  const { data: auditRows } = ids.length
    ? await supabase.from("attendance_correction_audit").select("id,request_id,actor_label,event_type,occurred_at,details")
      .in("request_id", ids).order("occurred_at", { ascending: true })
    : { data: [] as AuditRow[] };
  const auditsByRequest = new Map<string, AuditRow[]>();
  for (const audit of (auditRows ?? []) as AuditRow[]) auditsByRequest.set(audit.request_id, [...(auditsByRequest.get(audit.request_id) ?? []), audit]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">Attendance</p><h1 className="page-heading">Request a correction</h1><p className="page-description">Ask your manager to correct a missed or inaccurate check-in or check-out time. Changes take effect only after approval.</p></div><Link href="/app" className="btn-ghost btn-sm">Back to check-in</Link></div>
      <Flash msg={sp.msg} error={sp.error} />
      <form action={submitAttendanceCorrection} className="card space-y-4">
        <div><h2 className="font-bold">Correction details</h2><p className="mt-1 text-sm leading-6 text-muted">Use your organization’s local time. Leave a time blank if it does not need changing. If check-out is earlier than check-in, it is treated as the following day for an overnight shift.</p></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label htmlFor="work-date" className="label">Work date</label><input id="work-date" name="work_date" type="date" max={todayIn(org.timezone)} defaultValue={todayIn(org.timezone)} className="input" required /></div>
          <div><label htmlFor="check-in" className="label">Correct check-in (optional)</label><input id="check-in" name="check_in" type="time" className="input" /></div>
          <div><label htmlFor="check-out" className="label">Correct check-out (optional)</label><input id="check-out" name="check_out" type="time" className="input" /></div>
        </div>
        <div><label htmlFor="reason" className="label">Why should this time be corrected?</label><textarea id="reason" name="reason" rows={3} maxLength={1000} minLength={10} className="input resize-y" required placeholder="For example: the site was temporarily offline when I finished my shift." /></div>
        <div className="rounded-xl bg-paper px-3 py-2 text-xs leading-5 text-muted">Approved corrections are marked in attendance reports. Original and corrected times, the reason, and the manager’s decision are kept in the audit trail. A corrected event does not create or change a GPS location.</div>
        <button className="btn-primary w-full sm:w-auto">Send for manager review</button>
      </form>

      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Your requests</h2><span className="text-xs text-muted">Latest 20</span></div>
        {requests.length === 0 ? <p className="card text-sm text-muted">You have not requested an attendance correction.</p> : requests.map((request) => (
          <article key={request.id} className="card space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{new Intl.DateTimeFormat("en-NG", { timeZone: org.timezone, day: "numeric", month: "long", year: "numeric" }).format(new Date(`${request.work_date}T12:00:00`))}</h3><p className="mt-1 text-xs text-muted">Sent {localDateTime(request.submitted_at, org.timezone)}</p></div><span className={`chip ${request.status === "approved" ? "bg-green-50 text-ok" : request.status === "rejected" ? "bg-red-50 text-bad" : "bg-amber-50 text-warn"}`}>{request.status === "pending" ? "Waiting for review" : request.status}</span></div>
            <div className="grid gap-2 text-sm sm:grid-cols-2"><p><span className="text-muted">Requested check-in: </span>{request.requested_in_at ? localDateTime(request.requested_in_at, org.timezone) : "No change"}</p><p><span className="text-muted">Requested check-out: </span>{request.requested_out_at ? localDateTime(request.requested_out_at, org.timezone) : "No change"}</p></div>
            <p className="text-sm leading-6">{request.reason}</p>
            {request.review_note && <p className="rounded-xl bg-paper px-3 py-2 text-sm"><b>Manager’s note:</b> {request.review_note}</p>}
            <details className="border-t border-line pt-3"><summary className="cursor-pointer text-sm font-semibold">Audit trail ({(auditsByRequest.get(request.id) ?? []).length})</summary><ol className="mt-3 space-y-3">{(auditsByRequest.get(request.id) ?? []).map((audit) => <li key={audit.id} className="border-l-2 border-line pl-3"><p className="text-sm font-medium capitalize">{audit.event_type} · {audit.actor_label}</p><p className="mt-0.5 text-xs text-muted">{localDateTime(audit.occurred_at, org.timezone)}</p>{auditTimes(audit.details ?? {}, org.timezone).length > 0 && <ul className="mt-2 space-y-1 text-xs text-muted">{auditTimes(audit.details ?? {}, org.timezone).map((item) => <li key={`${audit.id}-${item.label}`}><span className="font-medium text-ink">{item.label}:</span> {item.at}</li>)}</ul>}</li>)}</ol></details>
          </article>
        ))}
      </section>
    </div>
  );
}
