import Link from "next/link";
import { requireConsole } from "@/lib/console";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { Reason } from "../Reason";
import { saveDataRequest } from "./actions";

export const dynamic = "force-dynamic";

const KINDS = { access: "Access (a copy of their data)", correction: "Correction", deletion: "Deletion", objection: "Objection", restriction: "Restriction", portability: "Portability", complaint: "Complaint", other: "Other" } as const;
const STATUS = { new: "New", verifying: "Checking identity", in_progress: "In progress", with_company: "Passed to the company", completed: "Completed", refused: "Refused" } as const;

export default async function DataRequests({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const flash = readFlash(sp);
  const all = sp.all === "1";
  const { supabase, role } = await requireConsole();
  const canEdit = role === "owner" || role === "support";
  const [{ data, error }, { data: companies }] = await Promise.all([
    supabase.rpc("console_data_requests", { p_open_only: !all }),
    supabase.rpc("console_companies", { p_search: null as unknown as string, p_archived: false }),
  ]);
  const names = new Map((companies ?? []).map((c) => [c.id, c.name]));
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="page-heading">Data protection requests</h1><p className="text-sm text-muted">Requests from people about their personal data (NDPA and GDPR). Each is due 30 days after it arrives. For staff and visitor data, the company is the controller: pass the request to them and help.</p></div>
        <Link href={all ? "/console/data-requests" : "/console/data-requests?all=1"} className="btn-ghost btn-sm">{all ? "Open only" : "Show all"}</Link>
      </div>
      <Flash {...flash} />
      {error && <p className="card text-bad">{error.message}</p>}
      {canEdit && <details className="card"><summary className="cursor-pointer font-bold">Log a new request</summary>
        <form action={saveDataRequest.bind(null, null)} className="mt-3 grid gap-3 md:grid-cols-3">
          <div><label className="label" htmlFor="d-name">Person’s name</label><input id="d-name" name="requester_name" required minLength={2} className="input" /></div>
          <div><label className="label" htmlFor="d-email">Their email</label><input id="d-email" name="requester_email" type="email" className="input" /></div>
          <div><label className="label" htmlFor="d-rel">They are</label><select id="d-rel" name="relationship" className="input"><option value="staff">A company’s staff member</option><option value="visitor">A visitor</option><option value="admin">A company admin</option><option value="prospect">Someone who contacted us</option><option value="other">Other</option></select></div>
          <div><label className="label" htmlFor="d-kind">Request</label><select id="d-kind" name="kind" className="input">{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label className="label" htmlFor="d-org">Company (if any)</label><select id="d-org" name="org_id" className="input"><option value="">None</option>{(companies ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className="label" htmlFor="d-rec">Received on</label><input id="d-rec" name="received_at" type="date" defaultValue={today} className="input" /></div>
          <div className="md:col-span-3"><label className="label" htmlFor="d-details">Details</label><textarea id="d-details" name="details" rows={3} maxLength={4000} className="input" /></div>
          <div className="md:col-span-2"><Reason /></div><button className="btn-primary">Log request</button>
        </form></details>}
      <div className="space-y-3">{(data ?? []).length === 0 ? <p className="card text-muted">No requests.</p> : (data ?? []).map((r) => {
        const open = !["completed", "refused"].includes(r.status);
        const overdue = open && r.due_at < today;
        return (
          <article key={r.id} className={`card space-y-2 ${overdue ? "border-bad/40" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="font-bold">#{r.number} {KINDS[r.kind as keyof typeof KINDS]} · {r.requester_name}</p>
                <p className="text-xs text-muted">{r.requester_email ?? "No email"} · {r.relationship}{r.org_id ? ` · ${names.get(r.org_id) ?? "Company"}` : ""} · received {r.received_at}</p></div>
              <p className={`text-sm font-semibold ${overdue ? "text-bad" : "text-muted"}`}>{open ? `Due ${r.due_at}${overdue ? " · overdue" : ""}` : `${STATUS[r.status as keyof typeof STATUS]}`}</p>
            </div>
            {r.details && <p className="whitespace-pre-wrap text-sm">{r.details}</p>}
            {r.outcome && <p className="whitespace-pre-wrap rounded-lg bg-paper p-2 text-sm"><b>Outcome:</b> {r.outcome}</p>}
            {canEdit && open && <form action={saveDataRequest.bind(null, r.id)} className="grid gap-2 md:grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
              <select name="status" defaultValue={r.status} className="input" aria-label="Status">{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input name="outcome" placeholder="What was done" maxLength={4000} className="input" aria-label="Outcome" />
              <Reason /><button className="btn-ghost">Update</button>
            </form>}
          </article>
        );
      })}</div>
    </div>
  );
}
