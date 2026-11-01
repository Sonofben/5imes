import Link from "next/link";
import { requireConsole, fmtDateTime } from "@/lib/console";
import { friendly } from "@/lib/errors";
import { TICKET_STATUS, STATUS_TONE, TICKET_PRIORITIES } from "@/lib/support";

export const dynamic = "force-dynamic";

const FILTERS = [["active", "Needs attention"], ["open", "Open"], ["waiting_on_customer", "Waiting on customer"], ["resolved", "Resolved"], ["closed", "Closed"], ["all", "All"]] as const;

export default async function ConsoleSupport({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const sp = await searchParams;
  const filter = FILTERS.some(([k]) => k === sp.s) ? sp.s! : "active";
  const { supabase } = await requireConsole();
  const { data, error } = await supabase.rpc("console_support_tickets", { p_status: (filter === "all" ? null : filter) as string });
  const rows = data ?? [];
  return (
    <div className="space-y-4">
      <div><h1 className="page-heading">Support tickets</h1><p className="text-sm text-muted">Tickets from company admins. Urgent and unanswered tickets come first.</p></div>
      <nav className="flex flex-wrap gap-2 text-sm">{FILTERS.map(([k, label]) => <Link key={k} href={`/console/support?s=${k}`} className={`rounded-full border px-3 py-1.5 font-semibold ${filter === k ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>{label}</Link>)}</nav>
      {error && <p className="card text-bad">{friendly(error, "console/support")}</p>}
      <div className="card overflow-x-auto p-0"><table className="table min-w-[900px]">
        <thead><tr><th>#</th><th>Subject</th><th>Company</th><th>Priority</th><th>Status</th><th>Assigned</th><th>Updated</th></tr></thead>
        <tbody>{rows.length === 0 ? <tr><td colSpan={7} className="text-muted">Nothing here.</td></tr> : rows.map((t) => (
          <tr key={t.id}>
            <td className="tabular-nums">{t.number}</td>
            <td><Link href={`/console/support/${t.id}`} className="font-semibold underline">{t.subject}</Link>{t.last_reply_by === "customer" && t.status === "open" && <span className="ml-2 text-xs font-semibold text-warn">Customer waiting</span>}</td>
            <td><Link href={`/console/companies/${t.org_id}`} className="underline">{t.org_name}</Link></td>
            <td className={t.priority === "urgent" ? "font-bold text-bad" : t.priority === "high" ? "font-semibold text-warn" : ""}>{TICKET_PRIORITIES[t.priority as keyof typeof TICKET_PRIORITIES].split(":")[0]}</td>
            <td><span className={`chip ${STATUS_TONE[t.status]}`}>{TICKET_STATUS[t.status as keyof typeof TICKET_STATUS]}</span></td>
            <td className="text-xs">{t.assigned_email ?? "Nobody"}</td>
            <td className="text-xs">{fmtDateTime(t.updated_at)}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
