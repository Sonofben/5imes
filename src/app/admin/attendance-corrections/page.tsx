import { Flash } from "@/components/Flash";
import { requireMember, timeIn } from "@/lib/session";
import { reviewAttendanceCorrection } from "./actions";

export const dynamic = "force-dynamic";

type Correction = {
  id: string; member_id: string; work_date: string; requested_in_at: string | null; requested_out_at: string | null;
  reason: string; status: "pending" | "approved" | "rejected"; submitted_at: string; reviewed_at: string | null;
  reviewed_by: string | null; review_note: string | null;
};
type AuditRow = { id: string; request_id: string; actor_label: string; event_type: string; occurred_at: string; details: Record<string, unknown> };

function dateIn(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-NG", { timeZone: timezone, day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}
function dateTimeIn(value: string, timezone: string) {
  return `${dateIn(value, timezone)} · ${timeIn(value, timezone)}`;
}
function auditTimes(details: Record<string, unknown>, timezone: string) {
  const output: { label: string; at: string }[] = [];
  const add = (label: string, value: unknown) => {
    if (typeof value === "string" && !Number.isNaN(new Date(value).getTime())) output.push({ label, at: dateTimeIn(value, timezone) });
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

export default async function AttendanceCorrectionsPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, me } = await requireMember({ viewer: true });
  const { data } = await supabase.from("attendance_correction_requests")
    .select("id,member_id,work_date,requested_in_at,requested_out_at,reason,status,submitted_at,reviewed_at,reviewed_by,review_note")
    .eq("org_id", org.id).order("submitted_at", { ascending: false }).limit(100);
  const requests = (data ?? []) as Correction[];
  const memberIds = [...new Set(requests.map((row) => row.member_id))];
  const [{ data: memberRows }, { data: auditRows }] = await Promise.all([
    memberIds.length ? supabase.from("members").select("id,full_name,email").in("id", memberIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string }[] }),
    requests.length ? supabase.from("attendance_correction_audit").select("id,request_id,actor_label,event_type,occurred_at,details")
      .in("request_id", requests.map((row) => row.id)).order("occurred_at", { ascending: true }) : Promise.resolve({ data: [] as AuditRow[] }),
  ]);
  const members = new Map((memberRows ?? []).map((row) => [row.id, row]));
  const auditsByRequest = new Map<string, AuditRow[]>();
  for (const audit of (auditRows ?? []) as AuditRow[]) auditsByRequest.set(audit.request_id, [...(auditsByRequest.get(audit.request_id) ?? []), audit]);
  const pending = requests.filter((request) => request.status === "pending");
  const recent = requests.filter((request) => request.status !== "pending").slice(0, 30);

  return (
    <div className="space-y-6">
      <div><p className="eyebrow">Attendance</p><h1 className="page-heading">Correction requests</h1><p className="page-description">Review staff-submitted time corrections. Approving updates the attendance times; GPS/location data is not invented. Every decision is recorded.</p></div>
      <Flash msg={sp.msg} error={sp.error} />
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">Waiting for review</h2><span className="chip bg-amber-50 text-warn">{pending.length} pending</span></div>
        {pending.length === 0 ? <p className="card text-sm text-muted">There are no attendance corrections waiting for review.</p> : pending.map((request) => {
          const person = members.get(request.member_id);
          const label = person?.full_name || person?.email || "Former team member";
          const audits = auditsByRequest.get(request.id) ?? [];
          return <article key={request.id} className="card space-y-4 border-amber-200 bg-[#fffdf8]">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="eyebrow">{dateIn(`${request.work_date}T12:00:00`, org.timezone)}</p><h3 className="mt-1 text-lg font-bold">{label}</h3><p className="text-xs text-muted">{person?.email ?? "Membership no longer active"} · submitted {dateTimeIn(request.submitted_at, org.timezone)}</p></div><span className="chip bg-amber-50 text-warn">Pending</span></div>
            <div className="grid gap-2 rounded-xl bg-white p-3 text-sm sm:grid-cols-2"><p><span className="text-muted">Requested check-in: </span>{request.requested_in_at ? dateTimeIn(request.requested_in_at, org.timezone) : "No change"}</p><p><span className="text-muted">Requested check-out: </span>{request.requested_out_at ? dateTimeIn(request.requested_out_at, org.timezone) : "No change"}</p></div>
            <p className="text-sm leading-6"><b>Reason:</b> {request.reason}</p>
            {request.member_id === me.id && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-warn">You submitted this request, so you cannot review it.</p>}
            <form action={reviewAttendanceCorrection.bind(null, request.id)} className="space-y-3 border-t border-line pt-3">
              <div><label className="label" htmlFor={`note-${request.id}`}>Review note (optional)</label><textarea id={`note-${request.id}`} name="note" maxLength={500} rows={2} className="input resize-y" placeholder="Add a short explanation for the employee." /></div>
              <div className="flex flex-wrap gap-2"><button name="decision" value="approve" disabled={request.member_id === me.id} className="btn-primary btn-sm">Approve and update attendance</button><button name="decision" value="reject" disabled={request.member_id === me.id} className="btn-ghost btn-sm text-bad">Reject</button></div>
            </form>
            <details className="border-t border-line pt-3"><summary className="cursor-pointer text-sm font-semibold">Audit trail ({audits.length})</summary><ol className="mt-3 space-y-3">{audits.map((audit) => <li key={audit.id} className="border-l-2 border-line pl-3"><p className="text-sm font-medium capitalize">{audit.event_type} · {audit.actor_label}</p><p className="mt-0.5 text-xs text-muted">{dateTimeIn(audit.occurred_at, org.timezone)}</p>{auditTimes(audit.details ?? {}, org.timezone).length > 0 && <ul className="mt-2 space-y-1 text-xs text-muted">{auditTimes(audit.details ?? {}, org.timezone).map((item) => <li key={`${audit.id}-${item.label}`}><span className="font-medium text-ink">{item.label}:</span> {item.at}</li>)}</ul>}</li>)}</ol></details>
          </article>;
        })}
      </section>

      {recent.length > 0 && <section className="space-y-3"><h2 className="text-lg font-bold">Recently reviewed</h2>{recent.map((request) => {
        const person = members.get(request.member_id);
        const audits = auditsByRequest.get(request.id) ?? [];
        return <article key={request.id} className="card space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{person?.full_name || person?.email || "Former team member"} · {dateIn(`${request.work_date}T12:00:00`, org.timezone)}</h3><p className="mt-1 text-xs text-muted">Submitted {dateTimeIn(request.submitted_at, org.timezone)}{request.reviewed_at ? ` · reviewed ${dateTimeIn(request.reviewed_at, org.timezone)}` : ""}</p></div><span className={`chip ${request.status === "approved" ? "bg-green-50 text-ok" : "bg-red-50 text-bad"}`}>{request.status}</span></div>
          <p className="text-sm leading-6">{request.reason}</p>{request.review_note && <p className="text-sm text-muted"><b>Manager’s note:</b> {request.review_note}</p>}
          <details className="border-t border-line pt-3"><summary className="cursor-pointer text-sm font-semibold">Audit trail ({audits.length})</summary><ol className="mt-3 space-y-3">{audits.map((audit) => <li key={audit.id} className="border-l-2 border-line pl-3"><p className="text-sm font-medium capitalize">{audit.event_type} · {audit.actor_label}</p><p className="mt-0.5 text-xs text-muted">{dateTimeIn(audit.occurred_at, org.timezone)}</p>{auditTimes(audit.details ?? {}, org.timezone).map((item) => <p key={`${audit.id}-${item.label}`} className="mt-1 text-xs text-muted"><b className="text-ink">{item.label}:</b> {item.at}</p>)}</li>)}</ol></details>
        </article>;
      })}</section>}
    </div>
  );
}
