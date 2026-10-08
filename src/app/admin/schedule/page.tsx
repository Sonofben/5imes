import { requireMember, type Member, type Subscription } from "@/lib/session";
import { WEEKDAYS } from "@/lib/constants";
import { Flash } from "@/components/Flash";
import { saveSchedule } from "./actions";

export const dynamic = "force-dynamic";

type Row = { member_id: string | null; weekday: number; mode: string };

function DaySelects({ rows, allowInherit }: { rows: Row[]; allowInherit?: boolean }) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {WEEKDAYS.map((d, i) => {
        const current = rows.find((r) => r.weekday === i + 1)?.mode ?? "";
        return (
          <label key={d} className="text-center">
            <span className="mb-1 block text-xs font-semibold text-muted">{d}</span>
            <select name={`d${i + 1}`} defaultValue={current || (allowInherit ? "" : "off")} className="input px-1 py-1.5 text-xs">
              {allowInherit && <option value="">Default</option>}
              <option value="office">Office</option>
              <option value="home">Home</option>
              <option value="off">Off</option>
            </select>
          </label>
        );
      })}
    </div>
  );
}

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, org } = await requireMember({ admin: true });
  const [{ data: schedules }, { data: members }, { data: sub }] = await Promise.all([
    supabase.from("schedules").select("member_id, weekday, mode").eq("org_id", org.id),
    supabase.from("members").select("*").eq("org_id", org.id).eq("status", "active").order("full_name"),
    supabase.from("subscriptions").select("plan").eq("org_id", org.id).maybeSingle<Pick<Subscription, "plan">>(),
  ]);
  const all = (schedules ?? []) as Row[];
  const isPro = sub?.plan !== "basic";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Work schedule</h1>
        <p className="text-sm text-muted">
          Which days are office days and which are home days. A check-in from the wrong place on a given day is flagged.
        </p>
      </div>
      <Flash msg={sp.msg} error={sp.error} />

      <form action={saveSchedule.bind(null, org.id, null)} className="card space-y-4">
        <h2 className="font-bold">Company default</h2>
        <DaySelects rows={all.filter((r) => r.member_id === null)} />
        <button className="btn-primary">Save default</button>
      </form>

      <section className="card space-y-4">
        <div>
          <h2 className="font-bold">Per-person schedules {!isPro && <span className="chip ml-1 bg-brand/15 text-brand-dark">Pro</span>}</h2>
          <p className="text-sm text-muted">Override the default for people with a different arrangement. “Default” follows the company schedule.</p>
        </div>
        {isPro ? (
          <ul className="divide-y divide-line">
            {((members ?? []) as Member[]).map((m) => (
              <li key={m.id} className="py-3">
                <form action={saveSchedule.bind(null, org.id, m.id)} className="flex flex-col gap-2 lg:flex-row lg:items-end">
                  <div className="lg:w-48">
                    <div className="font-medium">{m.full_name || m.email}</div>
                    <div className="text-xs text-muted">{m.team || m.email}</div>
                  </div>
                  <div className="flex-1">
                    <DaySelects rows={all.filter((r) => r.member_id === m.id)} allowInherit />
                  </div>
                  <button className="btn-ghost btn-sm">Save</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">
            <a href="/admin/billing" className="underline">Upgrade to Pro</a> to give individuals or teams their own office/home days.
          </p>
        )}
      </section>
    </div>
  );
}
