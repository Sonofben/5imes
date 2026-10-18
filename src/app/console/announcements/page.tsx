import { requireConsole, can, fmtDateTime } from "@/lib/console";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { Reason } from "../Reason";
import { announce, endAnnouncement, setPlatform } from "../actions";

export const dynamic = "force-dynamic";

type Plans = { trial_days: number; maintenance_mode: boolean; maintenance_message: string | null };

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, role } = await requireConsole();
  const [{ data: anns }, { data: companies }, { data: plans }] = await Promise.all([
    supabase.rpc("console_announcements"), supabase.rpc("console_companies", { p_search: null, p_archived: false }), supabase.rpc("console_plans"),
  ]);
  const list = (anns ?? []);
  const p = (plans ?? { trial_days: 14, maintenance_mode: false, maintenance_message: null }) as Plans;
  return (
    <div className="space-y-6">
      <div><h1 className="page-heading">Announcements & maintenance</h1><p className="page-description">Messages appear as a banner at the top of the company admin pages and the staff check-in screen.</p></div>
      <Flash {...readFlash(sp)} />
      {p.maintenance_mode && <p className="card border-red-200 bg-red-50 text-sm text-bad"><b>Maintenance mode is ON.</b> Check-ins and check-outs are paused for everyone. {p.maintenance_message}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {can.announce(role) && <form action={announce} className="card space-y-3"><h2 className="font-bold">New announcement</h2>
          <textarea name="message" required minLength={3} maxLength={400} className="input min-h-24" placeholder="e.g. New: line managers can now approve work from other places." aria-label="Message" />
          <div className="grid gap-2 sm:grid-cols-2">
            <div><label className="label" htmlFor="an-level">Type</label><select id="an-level" name="level" className="input" defaultValue="info"><option value="info">Information</option><option value="warning">Warning</option><option value="critical">Urgent</option></select></div>
            <div><label className="label" htmlFor="an-aud">Who sees it</label><select id="an-aud" name="audience" className="input" defaultValue="everyone"><option value="everyone">Everyone</option><option value="admins">Company admins and managers only</option></select></div>
            <div><label className="label" htmlFor="an-org">Company</label><select id="an-org" name="org" className="input" defaultValue=""><option value="">All companies</option>{(companies ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} (@{c.domain})</option>)}</select></div>
            <div><label className="label" htmlFor="an-hours">Show for</label><select id="an-hours" name="hours" className="input" defaultValue="72"><option value="24">1 day</option><option value="72">3 days</option><option value="168">1 week</option><option value="720">30 days</option><option value="0">Until I end it</option></select></div>
          </div>
          <Reason /><button className="btn-primary">Publish</button></form>}

        {can.ownerOnly(role) && <form action={setPlatform.bind(null, "/console/announcements")} className="card space-y-3"><h2 className="font-bold">Maintenance mode</h2>
          <p className="text-sm text-muted">Pauses every check-in and check-out across all companies and shows your message. Use only during planned work.</p>
          <input type="hidden" name="trial_days" value={p.trial_days} />
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="maintenance" defaultChecked={p.maintenance_mode} className="h-4 w-4" /> Maintenance mode on</label>
          <input name="maintenance_message" defaultValue={p.maintenance_message ?? ""} maxLength={300} className="input" placeholder="e.g. Upgrading servers until 10pm. Check in again after." aria-label="Maintenance message" />
          <Reason /><button className="btn-primary">Save</button></form>}
      </div>

      <section className="card overflow-x-auto"><h2 className="mb-2 font-bold">Announcements</h2>
        <table className="table"><thead><tr><th>Message</th><th>Type</th><th>Shown to</th><th>From</th><th>Until</th><th>Status</th><th></th></tr></thead>
          <tbody>{list.length === 0 ? <tr><td colSpan={7} className="text-muted">None yet.</td></tr> : list.map((a) => <tr key={a.id}>
            <td className="max-w-md">{a.message}</td><td className="capitalize">{a.level}</td><td className="text-xs">{a.company ?? "All companies"} · {a.audience === "admins" ? "admins" : "everyone"}</td>
            <td className="text-xs">{fmtDateTime(a.starts_at)}</td><td className="text-xs">{a.ends_at ? fmtDateTime(a.ends_at) : "Until ended"}</td>
            <td>{a.live ? <span className="chip bg-green-50 text-ok">Live</span> : <span className="chip bg-paper text-muted">Ended</span>}</td>
            <td>{a.live && can.announce(role) && <form action={endAnnouncement.bind(null, a.id)}><button className="btn-ghost btn-sm">End now</button></form>}</td>
          </tr>)}</tbody></table></section>
    </div>
  );
}
