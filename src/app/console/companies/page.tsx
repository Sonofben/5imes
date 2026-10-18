import Link from "next/link";
import { requireConsole, can, fmtDate } from "@/lib/console";
import { Flash } from "@/components/Flash";
import { Reason } from "../Reason";
import { createCompany } from "./actions";

export const dynamic = "force-dynamic";

type Row = { id: string; name: string; domain: string; slug: string; plan: string; status: string; trial_ends_at: string | null; current_period_end: string | null; seats_paid: number; seats_used: number; created_at: string; suspended_at: string | null; owner_email: string | null; last_check_in: string | null; support_until: string | null; archived_at: string | null };

function state(c: Row) {
  if (c.archived_at) return ["Archived", "bg-paper text-muted"];
  if (c.suspended_at) return ["Suspended", "bg-red-50 text-bad"];
  if (c.status === "trialing") return new Date(c.trial_ends_at ?? 0) > new Date() ? ["Trial", "bg-amber-50 text-warn"] : ["Trial ended", "bg-red-50 text-bad"];
  if (["active", "past_due"].includes(c.status)) return new Date(c.current_period_end ?? 0) > new Date() ? ["Paying", "bg-green-50 text-ok"] : ["Term ended", "bg-red-50 text-bad"];
  return [c.status, "bg-paper text-muted"];
}

export default async function GlobalCompanies({ searchParams }: { searchParams: Promise<{ q?: string; archived?: string; new?: string; error?: string }> }) {
  const sp = await searchParams;
  const archived = sp.archived === "1";
  const { supabase, role } = await requireConsole();
  const [{ data, error }, { data: plans }] = await Promise.all([
    supabase.rpc("console_companies", { p_search: sp.q ?? null, p_archived: archived }),
    supabase.rpc("public_plans"),
  ]);
  const rows = (data ?? []) as Row[];
  const trialDays = (plans as { trial_days?: number } | null)?.trial_days ?? 14;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="page-heading">{archived ? "Archived companies" : "Companies"}</h1>
          <Link href={archived ? "/console/companies" : "/console/companies?archived=1"} className="text-sm text-muted underline">{archived ? "← Active companies" : "Show archived"}</Link></div>
        <form className="flex gap-2">{archived && <input type="hidden" name="archived" value="1" />}<input name="q" defaultValue={sp.q} placeholder="Search name, domain or link" className="input w-64" /><button className="btn-primary">Search</button></form>
      </div>
      <Flash error={sp.error} />
      {error && <p className="card text-bad">{error.message}</p>}

      {can.createCompany(role) && !archived && (
        <details className="card" open={sp.new === "1"}>
          <summary className="cursor-pointer font-bold">+ Create a company for a client</summary>
          <form action={createCompany} className="mt-3 grid gap-3 md:grid-cols-2">
            <div><label className="label" htmlFor="nc-name">Company name</label><input id="nc-name" name="name" required minLength={2} className="input" /></div>
            <div><label className="label" htmlFor="nc-domain">Email domain</label><input id="nc-domain" name="domain" required placeholder="acme.com.ng" className="input" /></div>
            <div><label className="label" htmlFor="nc-owner">Owner (company admin) email</label><input id="nc-owner" name="owner_email" type="email" required className="input" /></div>
            <div><label className="label" htmlFor="nc-oname">Owner name</label><input id="nc-oname" name="owner_name" className="input" /></div>
            <div><label className="label" htmlFor="nc-trial">Pro trial (days)</label><input id="nc-trial" name="trial_days" type="number" min={1} max={90} defaultValue={trialDays} className="input" /></div>
            <div><label className="label" htmlFor="nc-reason">Reason</label><Reason placeholder="e.g. Signed contract with client" /></div>
            <p className="text-xs text-muted md:col-span-2">The owner gets an invitation email, sets a password and lands on the company’s admin home.</p>
            <div className="md:col-span-2"><button className="btn-primary">Create company</button></div>
          </form>
        </details>
      )}

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
