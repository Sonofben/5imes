import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConsole, can, fmtDateTime } from "@/lib/console";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUS, STATUS_TONE } from "@/lib/support";
import { staffReply } from "../actions";

export const dynamic = "force-dynamic";

export default async function ConsoleTicket({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const flash = readFlash(await searchParams);
  const { supabase, role } = await requireConsole();
  const [{ data: list }, { data: msgs }] = await Promise.all([
    supabase.rpc("console_support_tickets", {}),
    supabase.rpc("console_support_messages", { p_ticket: id }),
  ]);
  const t = (list ?? []).find((x) => x.id === id);
  if (!t) notFound();
  const canReply = can.enquiries(role);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4">
        <div><Link href="/console/support" className="text-sm text-muted underline">All tickets</Link><h1 className="page-heading mt-1">#{t.number} {t.subject}</h1></div>
        <Flash {...flash} />
        <ol className="space-y-3">{(msgs ?? []).map((m) => (
          <li key={m.id} className={`card ${m.internal ? "border-amber-300 bg-amber-50" : m.from_staff ? "border-[#1E4E9C]/30 bg-[#f3f7fd]" : ""}`}>
            <p className="text-xs text-muted"><b className="text-ink">{m.internal ? "Internal note" : m.from_staff ? "5ime support" : m.author_name}</b> · {fmtDateTime(m.created_at)}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{m.body}</p>
          </li>
        ))}</ol>
        {canReply && <form action={staffReply.bind(null, id)} className="card space-y-3">
          <label className="label" htmlFor="s-body">Reply</label>
          <textarea id="s-body" name="body" rows={5} maxLength={8000} className="input" />
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="internal" /> Internal note (the customer won’t see it)</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="assign" defaultChecked={!t.assigned_email} /> Assign to me</label>
            <select name="status" defaultValue="" className="input w-auto" aria-label="Status"><option value="">Status: automatic</option>{Object.entries(TICKET_STATUS).map(([k, v]) => <option key={k} value={k}>Set to {v.toLowerCase()}</option>)}</select>
          </div>
          <button className="btn-primary">Save</button>
        </form>}
      </div>
      <aside className="card h-fit space-y-2 text-sm">
        <p><span className={`chip ${STATUS_TONE[t.status]}`}>{TICKET_STATUS[t.status as keyof typeof TICKET_STATUS]}</span></p>
        <p><b>Company:</b> <Link href={`/console/companies/${t.org_id}`} className="underline">{t.org_name}</Link></p>
        <p><b>Opened by:</b> {t.opened_by_email ?? "Unknown"}</p>
        <p><b>Topic:</b> {TICKET_CATEGORIES[t.category as keyof typeof TICKET_CATEGORIES]}</p>
        <p><b>Priority:</b> {TICKET_PRIORITIES[t.priority as keyof typeof TICKET_PRIORITIES]}</p>
        <p><b>Assigned:</b> {t.assigned_email ?? "Nobody"}</p>
        <p><b>Opened:</b> {fmtDateTime(t.created_at)}</p>
        <p className="text-xs text-muted">To see their workspace, ask the company to grant support access, then use View as on the company page.</p>
      </aside>
    </div>
  );
}
