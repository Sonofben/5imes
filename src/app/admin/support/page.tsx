import Link from "next/link";
import { requireMember } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUS, STATUS_TONE } from "@/lib/support";
import { CONTACT } from "@/lib/constants";
import { openTicket } from "./actions";

export const dynamic = "force-dynamic";

export default async function SupportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const flash = readFlash(await searchParams);
  const { supabase, org } = await requireMember({ admin: true });
  const { data: tickets } = await supabase.from("support_tickets").select("id,number,subject,status,priority,updated_at,last_reply_by")
    .eq("org_id", org.id).order("updated_at", { ascending: false }).limit(100);
  const fmt = (d: string) => new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: org.timezone }).format(new Date(d));
  return (
    <div className="space-y-6">
      <div><p className="eyebrow">Organization</p><h1 className="page-heading">Support</h1><p className="page-description">Ask the 5ime team for help. We reply here and by email, usually within one working day. You can also email {CONTACT.support}.</p></div>
      <Flash {...flash} />
      <form action={openTicket} className="card space-y-3">
        <h2 className="font-bold">New ticket</h2>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_220px]">
          <div><label className="label" htmlFor="t-subject">Subject</label><input id="t-subject" name="subject" required minLength={3} maxLength={160} className="input" /></div>
          <div><label className="label" htmlFor="t-cat">Topic</label><select id="t-cat" name="category" className="input">{Object.entries(TICKET_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label className="label" htmlFor="t-pri">How urgent</label><select id="t-pri" name="priority" defaultValue="normal" className="input">{Object.entries(TICKET_PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        </div>
        <div><label className="label" htmlFor="t-body">What do you need?</label><textarea id="t-body" name="body" required minLength={10} maxLength={8000} rows={5} className="input" placeholder="What happened, who it affects, and what you expected." /></div>
        <p className="text-xs text-muted">Please don’t include passwords or card details.</p>
        <button className="btn-primary">Send to 5ime support</button>
      </form>
      <section className="card overflow-x-auto p-0">
        <table className="table min-w-[640px]">
          <thead><tr><th>#</th><th>Subject</th><th>Status</th><th>Last update</th></tr></thead>
          <tbody>{(tickets ?? []).length === 0 ? <tr><td colSpan={4} className="text-muted">No tickets yet.</td></tr> : (tickets ?? []).map((t) => (
            <tr key={t.id}><td className="tabular-nums">{t.number}</td><td><Link href={`/admin/support/${t.id}`} className="font-semibold underline">{t.subject}</Link>{t.status === "waiting_on_customer" && <span className="ml-2 text-xs font-semibold text-[#1E4E9C]">New reply</span>}</td>
              <td><span className={`chip ${STATUS_TONE[t.status]}`}>{TICKET_STATUS[t.status as keyof typeof TICKET_STATUS]}</span></td><td className="text-xs">{fmt(t.updated_at)}</td></tr>
          ))}</tbody>
        </table>
      </section>
    </div>
  );
}
