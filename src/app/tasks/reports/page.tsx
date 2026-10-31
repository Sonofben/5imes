import { redirect } from "next/navigation";
import { requireMember, todayIn } from "@/lib/session";
import { PlanLock } from "@/components/PlanLock";
import { friendly } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const Report = z.array(z.object({ member_id: z.string(), name: z.string(), team: z.string().nullable().optional(), assigned: z.number(), done: z.number(),
  on_time: z.number(), overdue_now: z.number(), open_now: z.number(), avg_days: z.number().nullable().optional() }));

/** Per person over a period: tasks given, done, done on time, overdue now. Managers see their team, admins everyone. */
export default async function TaskReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, org, isViewer, isAdmin } = await requireMember();
  if (!isViewer) redirect("/tasks");
  const { data: pro } = await supabase.rpc("org_has_pro", { p_org: org.id });
  if (!pro) return <PlanLock isAdmin={isAdmin} plan="Pro" title="Task reports are part of Pro and Premium" points={["See who finishes on time, what is overdue and how long tasks take, per person."]} />;
  const today = todayIn(org.timezone);
  const valid = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  const to = valid(sp.to) ?? today, from = valid(sp.from) ?? `${today.slice(0, 8)}01`;
  const { data, error } = await supabase.rpc("task_report", { p_from: from, p_to: to });
  const parsed = Report.safeParse(data);
  const rows = parsed.success ? parsed.data : [];
  const total = rows.reduce((a, r) => ({ done: a.done + r.done, on: a.on + r.on_time, overdue: a.overdue + r.overdue_now, open: a.open + r.open_now }), { done: 0, on: 0, overdue: 0, open: 0 });
  return (
    <div className="space-y-4">
      <form className="card flex flex-wrap items-end gap-3">
        <div><label className="label" htmlFor="r-from">From</label><input id="r-from" name="from" type="date" defaultValue={from} className="input" /></div>
        <div><label className="label" htmlFor="r-to">To</label><input id="r-to" name="to" type="date" defaultValue={to} className="input" /></div>
        <button className="btn-ghost">Show</button>
      </form>
      {error && <p className="card text-bad">{friendly(error, "tasks/report")}</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["Done in this period", String(total.done)], ["Done on time", total.done ? `${Math.round((total.on / total.done) * 100)}%` : "None yet"], ["Open now", String(total.open)], ["Overdue now", String(total.overdue)]].map(([l, v]) => (
          <div key={l} className="card space-y-1 p-4"><p className="text-sm text-muted">{l}</p><p className="text-3xl font-extrabold">{v}</p></div>))}
      </div>
      <div className="card overflow-x-auto p-0"><table className="table min-w-[720px]">
        <thead><tr><th>Person</th><th>Given</th><th>Done</th><th>On time</th><th>Average days</th><th>Open now</th><th>Overdue now</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.member_id}>
          <td><b>{r.name}</b>{r.team ? <span className="block text-xs text-muted">{r.team}</span> : null}</td>
          <td>{r.assigned}</td><td>{r.done}</td><td>{r.done ? `${Math.round((r.on_time / r.done) * 100)}%` : "None yet"}</td>
          <td>{r.avg_days ?? "None yet"}</td><td>{r.open_now}</td><td className={r.overdue_now ? "font-bold text-bad" : ""}>{r.overdue_now}</td>
        </tr>)}</tbody>
      </table></div>
      <p className="text-xs text-muted">This feeds performance reviews in a later version.</p>
    </div>
  );
}
