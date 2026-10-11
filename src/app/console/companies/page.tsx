import Link from "next/link";
import { requireConsole, fmtDate } from "@/lib/console";

export const dynamic = "force-dynamic";

type Row = { id: string; name: string; domain: string; slug: string; plan: string; status: string; trial_ends_at: string | null; current_period_end: string | null; seats_paid: number; seats_used: number; created_at: string; suspended_at: string | null; owner_email: string | null; last_check_in: string | null; support_until: string | null };

function state(c: Row) {
  if (c.suspended_at) return ["Suspended", "bg-red-50 text-bad"];
  if (c.status === "trialing") return new Date(c.trial_ends_at ?? 0) > new Date() ? ["Trial", "bg-amber-50 text-warn"] : ["Trial ended", "bg-red-50 text-bad"];
  if (["active", "past_due"].includes(c.status)) return new Date(c.current_period_end ?? 0) > new Date() ? ["Paying", "bg-green-50 text-ok"] : ["Term ended", "bg-red-50 text-bad"];
  return [c.status, "bg-paper text-muted"];
}

export default async function ConsoleCompanies({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { supabase } = await requireConsole();
  const { data, error } = await supabase.rpc("console_companies", { p_search: q ?? null });
  const rows = (data ?? []) as Row[];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><h1 className="page-heading">Companies</h1>
        <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Search name, domain or link" className="input w-64" /><button className="btn-primary">Search</button></form></div>
      {error && <p className="card text-bad">{error.message}</p>}
      <div className="card overflow-x-auto p-0"><table className="table min-w-[900px]">
        <thead><tr><th>Company</th><th>Status</th><th>Plan</th><th>Seats used / paid</th><th>Ends</th><th>Last check-in</th><th>Joined</th></tr></thead>
        <tbody>{rows.length === 0 ? <tr><td colSpan={7} className="text-muted">No companies found.</td></tr> : rows.map((c) => {
          const [label, tone] = state(c);
          return <tr key={c.id}>
            <td><Link href={`/console/companies/${c.id}`} className="font-semibold underline">{c.name}</Link><div className="text-xs text-muted">@{c.domain} · /{c.slug}{c.support_until ? " · support access on" : ""}</div></td>
            <td><span className={`chip ${tone}`}>{label}</span></td>
            <td className="capitalize">{c.plan}</td>
            <td className="tabular-nums">{c.seats_used} / {c.status === "trialing" ? "trial" : c.seats_paid}</td>
            <td>{fmtDate(c.status === "trialing" ? c.trial_ends_at : c.current_period_end)}</td>
            <td>{fmtDate(c.last_check_in)}</td>
            <td>{fmtDate(c.created_at)}</td>
          </tr>;
        })}</tbody>
      </table></div>
    </div>
  );
}
