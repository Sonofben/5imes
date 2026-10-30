import { requireMember, todayIn } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { PlanLock } from "@/components/PlanLock";

import { addHoliday, removeHoliday } from "./actions";

export const dynamic = "force-dynamic";

const fmt = (d: string) => new Intl.DateTimeFormat("en-NG", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

/** Nigerian public holidays (everyone) and the company's own holidays (Pro and Premium). */
export default async function HolidaysPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, org } = await requireMember({ admin: true });
  const today = todayIn(org.timezone);
  const [{ data: pub }, { data: own }, { data: pro }] = await Promise.all([
    supabase.from("public_holidays").select("day,name,confirmed").gte("day", today).order("day").limit(30),
    supabase.from("company_holidays").select("id,day,name").eq("org_id", org.id).gte("day", today).order("day"),
    supabase.rpc("org_has_visitors", { p_org: org.id }),
  ]);
  return (
    <div className="space-y-6">
      <div><p className="eyebrow">Operations</p><h1 className="page-heading">Holidays</h1>
        <p className="page-description">On a holiday nobody is marked late or absent and there is no automatic check-in. Anyone who works is recorded as holiday work.</p></div>
      <Flash {...readFlash(sp)} />

      <section className="card space-y-3">
        <div><h2 className="font-bold">Your company’s holidays</h2><p className="text-sm text-muted">Extra days off under your own policy, for example an end-of-year shutdown.</p></div>
        {pro ? <>
          <form action={addHoliday} className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-end">
            <div><label className="label" htmlFor="ch-day">Date</label><input id="ch-day" name="day" type="date" min={today} required className="input" /></div>
            <div><label className="label" htmlFor="ch-name">Name</label><input id="ch-name" name="name" required minLength={2} maxLength={80} className="input" placeholder="e.g. Company retreat" /></div>
            <button className="btn-primary">Add holiday</button>
          </form>
          {(own ?? []).length === 0 ? <p className="text-sm text-muted">No company holidays coming up.</p> :
            <ul className="divide-y divide-line">{(own ?? []).map((h) => <li key={h.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span><b>{h.name}</b> · {fmt(h.day)}</span>
              <form action={removeHoliday.bind(null, h.id)}><button className="btn-ghost btn-sm text-bad">Remove</button></form>
            </li>)}</ul>}
        </> : <PlanLock compact isAdmin plan="Pro" title="Company holidays are part of Pro and Premium" points={["Add your own days off; nobody is marked late or absent on them."]} />}
      </section>

      <section className="card space-y-3">
        <div><h2 className="font-bold">Nigerian public holidays</h2><p className="text-sm text-muted">Kept up to date by 5ime. Islamic holidays show as <i>Expected</i> until the Federal Government announces the date.</p></div>
        <ul className="divide-y divide-line">{(pub ?? []).map((h) => <li key={h.day} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
          <span><b>{h.name}</b> · {fmt(h.day)}</span>
          {h.confirmed ? <span className="chip bg-green-50 text-ok">Confirmed</span> : <span className="chip bg-amber-50 text-warn">Expected</span>}
        </li>)}</ul>
      </section>
    </div>
  );
}
