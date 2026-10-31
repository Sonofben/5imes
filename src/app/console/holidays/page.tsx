import { requireConsole, can } from "@/lib/console";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { Reason } from "../Reason";
import { removePublicHoliday, setPublicHoliday } from "../actions";

export const dynamic = "force-dynamic";

const fmt = (d: string) => new Intl.DateTimeFormat("en-NG", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

/**
 * Nigerian public holidays for every company. Islamic holidays are entered as "expected" and
 * confirmed (or moved) here when the Federal Government announces the date.
 */
export default async function HolidaysConsolePage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, role } = await requireConsole();
  const { data: rows } = await supabase.from("public_holidays").select("day,name,confirmed").gte("day", new Date(Date.now() - 31 * 86400000).toISOString().slice(0, 10)).order("day");
  const edit = can.ownerOnly(role) || role === "support";
  return (
    <div className="space-y-6">
      <div><h1 className="page-heading">Public holidays</h1>
        <p className="page-description">Nigerian public holidays apply to every company: nobody is late or absent, and there is no automatic check-in. Confirm Islamic holidays when the Federal Government announces them, and add any extra day it declares.</p></div>
      <Flash {...readFlash(sp)} />
      {edit && <form action={setPublicHoliday} className="card grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-end">
        <div><label className="label" htmlFor="h-day">Date</label><input id="h-day" name="day" type="date" required className="input" /></div>
        <div><label className="label" htmlFor="h-name">Name</label><input id="h-name" name="name" required minLength={2} maxLength={80} className="input" placeholder="e.g. Eid al-Fitr" /></div>
        <label className="flex items-center gap-2 pb-3 text-sm"><input type="checkbox" name="confirmed" defaultChecked /> Confirmed</label>
        <div className="sm:col-span-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><Reason placeholder="Reason, e.g. FG announcement of 18 March" /><button className="btn-primary">Save holiday</button></div>
        <p className="sm:col-span-3 text-xs text-muted">Saving a date that already exists updates it. Use this to confirm an expected date or rename it.</p>
      </form>}
      <div className="card overflow-x-auto p-0"><table className="table min-w-[560px]">
        <thead><tr><th>Date</th><th>Holiday</th><th>Status</th>{edit && <th className="text-right">Remove</th>}</tr></thead>
        <tbody>{(rows ?? []).map((h) => <tr key={h.day}>
          <td className="whitespace-nowrap">{fmt(h.day)}</td><td>{h.name}</td>
          <td>{h.confirmed ? <span className="chip bg-green-50 text-ok">Confirmed</span> : <span className="chip bg-amber-50 text-warn">Expected</span>}</td>
          {edit && <td><form action={removePublicHoliday.bind(null, h.day)} className="flex justify-end gap-2"><Reason placeholder="Reason" /><button className="btn-ghost btn-sm text-bad">Remove</button></form></td>}
        </tr>)}</tbody>
      </table></div>
    </div>
  );
}
