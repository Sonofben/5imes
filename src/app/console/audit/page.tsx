import { requireConsole, fmtDateTime } from "@/lib/console";

export const dynamic = "force-dynamic";

export default async function ConsoleAudit() {
  const { supabase } = await requireConsole();
  const { data, error } = await supabase.rpc("console_audit", { p_limit: 300 });
  const rows = (data ?? []) as { at: string; actor_email: string | null; org_name: string | null; action: string; reason: string | null; details: Record<string, unknown> }[];
  return (
    <div className="space-y-4">
      <h1 className="page-heading">Audit log</h1>
      {error && <p className="card text-bad">{error.message}</p>}
      <div className="card overflow-x-auto p-0"><table className="table min-w-[800px]">
        <thead><tr><th>When</th><th>Who</th><th>Company</th><th>Action</th><th>Reason</th><th>Details</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}><td className="whitespace-nowrap text-xs">{fmtDateTime(r.at)}</td><td>{r.actor_email}</td><td>{r.org_name ?? "—"}</td><td className="font-mono text-xs">{r.action}</td><td>{r.reason ?? "—"}</td><td className="max-w-xs break-all font-mono text-[11px] text-muted">{JSON.stringify(r.details)}</td></tr>)}</tbody>
      </table></div>
    </div>
  );
}
