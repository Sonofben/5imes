import { requireConsole, fmtDateTime } from "@/lib/console";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { Reason } from "../Reason";
import { sendBroadcast } from "./actions";

export const dynamic = "force-dynamic";

export default async function Messages({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const flash = readFlash(sp);
  const { supabase, role } = await requireConsole();
  const scope = ["all", "plan", "company"].includes(sp.scope ?? "") ? sp.scope! : "all";
  const plan = sp.plan ?? "pro";
  const org = sp.org ?? "";
  const canSend = role === "owner" || role === "support";
  const [{ data: companies }, { data: history }, recipients] = await Promise.all([
    supabase.rpc("console_companies", { p_search: null as unknown as string, p_archived: false }),
    supabase.rpc("console_broadcasts"),
    canSend && (scope !== "company" || org) ? supabase.rpc("console_broadcast_recipients", { p_scope: scope, p_plan: plan, p_org: (org || null) as string }) : Promise.resolve({ data: null }),
  ]);
  const count = recipients.data?.length ?? null;
  return (
    <div className="space-y-5">
      <div><h1 className="page-heading">Messages to company admins</h1><p className="text-sm text-muted">Email the owners and admins of every company, one plan, or one company. Staff never receive these. For a notice inside the app, use Announcements.</p></div>
      <Flash {...flash} />
      {!canSend ? <p className="card text-sm text-muted">Only Global admins and Support admins can send messages.</p> : <>
        <form method="get" className="card flex flex-wrap items-end gap-3">
          <div><label className="label" htmlFor="m-scope">Send to</label><select id="m-scope" name="scope" defaultValue={scope} className="input"><option value="all">Admins of every company</option><option value="plan">Admins of companies on a plan</option><option value="company">Admins of one company</option></select></div>
          {scope === "plan" && <div><label className="label" htmlFor="m-plan">Plan</label><select id="m-plan" name="plan" defaultValue={plan} className="input"><option value="trial">Trial</option><option value="basic">Basic</option><option value="pro">Pro</option><option value="premium">Premium</option></select></div>}
          {scope === "company" && <div><label className="label" htmlFor="m-org">Company</label><select id="m-org" name="org" defaultValue={org} className="input"><option value="">Choose…</option>{(companies ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
          <button className="btn-ghost">Check recipients</button>
          {count !== null && <p className="text-sm"><b>{count}</b> admin{count === 1 ? "" : "s"} will receive it.</p>}
        </form>
        {count !== null && count > 0 && <form action={sendBroadcast} className="card space-y-3">
          <input type="hidden" name="scope" value={scope} /><input type="hidden" name="plan" value={plan} /><input type="hidden" name="org" value={org} />
          <div><label className="label" htmlFor="m-subject">Subject</label><input id="m-subject" name="subject" required minLength={3} maxLength={160} className="input" /></div>
          <div><label className="label" htmlFor="m-body">Message</label><textarea id="m-body" name="body" required minLength={10} maxLength={10000} rows={8} className="input" placeholder="Plain text. Leave a blank line between paragraphs." /></div>
          <Reason />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirm" /> Send this email to {count} admin{count === 1 ? "" : "s"} now</label>
          <button className="btn-primary">Send</button>
        </form>}
      </>}
      <section className="card overflow-x-auto p-0"><table className="table min-w-[760px]">
        <thead><tr><th>Sent</th><th>Subject</th><th>To</th><th>Delivered</th><th>By</th></tr></thead>
        <tbody>{(history ?? []).length === 0 ? <tr><td colSpan={5} className="text-muted">No messages sent yet.</td></tr> : (history ?? []).map((h) => (
          <tr key={h.id}><td className="text-xs">{fmtDateTime(h.created_at)}</td><td>{h.subject}</td><td className="text-xs">{h.scope === "all" ? "Every company" : h.scope === "plan" ? `Plan: ${h.plan}` : h.org_name}</td><td className="tabular-nums">{h.sent}/{h.recipients}{h.failed ? <span className="text-bad"> · {h.failed} failed</span> : null}</td><td className="text-xs">{h.sender}</td></tr>
        ))}</tbody>
      </table></section>
    </div>
  );
}
