import Link from "next/link";
import { requireMember, timeIn, todayIn } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { MapView, type MapCircle } from "@/components/maps/MapView";
import { decideRequest, endSessionAtDeparture } from "./actions";

export const dynamic = "force-dynamic";

type Req = {
  id: string; member_id: string; status: string; requested_at: string; effective_from: string; local_date: string;
  lat: number; lng: number; accuracy_m: number | null; radius_m: number; place_name: string | null; address: string | null;
  reason: string; decided_at: string | null; decided_by: string | null; decision_note: string | null; approver_id: string | null;
};
type Departure = { id: string; member_id: string; departed_at: string; lat: number; lng: number; accuracy_m: number | null; resolution: string | null };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, me, isAdmin } = await requireMember({ viewer: true });
  const today = todayIn(org.timezone);
  const [{ data: requests }, { data: departures }, { data: people }, { data: offices }] = await Promise.all([
    supabase.from("work_location_requests")
      .select("id,member_id,status,requested_at,effective_from,local_date,lat,lng,accuracy_m,radius_m,place_name,address,reason,decided_at,decided_by,decision_note,approver_id")
      .eq("org_id", org.id).order("requested_at", { ascending: false }).limit(60),
    supabase.from("presence_departures").select("id,member_id,departed_at,lat,lng,accuracy_m,resolution")
      .eq("org_id", org.id).is("resolution", null).order("departed_at", { ascending: false }).limit(30),
    supabase.from("members").select("id,full_name,email,team,line_manager_id").eq("org_id", org.id),
    supabase.from("locations").select("id,name,lat,lng,radius_m").eq("org_id", org.id),
  ]);
  const person = new Map((people ?? []).map((p) => [p.id as string, p as { id: string; full_name: string | null; email: string; team: string | null; line_manager_id: string | null }]));
  const name = (id: string | null) => { const p = id ? person.get(id) : null; return p ? p.full_name || p.email : "—"; };
  const officeCircles: MapCircle[] = (offices ?? []).map((o) => ({ lat: o.lat, lng: o.lng, radius: o.radius_m, tone: "ink", label: o.name }));
  const all = (requests ?? []) as Req[];
  const pending = all.filter((r) => r.status === "pending" && r.member_id !== me.id);
  const decided = all.filter((r) => r.status !== "pending").slice(0, 30);
  // Only today's departures are actionable; older ones closed with the day.
  const leftWithoutAsking = ((departures ?? []) as Departure[])
    .filter((d) => d.member_id !== me.id && todayIn(org.timezone, new Date(d.departed_at)) === today);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Line manager</p>
        <h1 className="page-heading">Work-location requests</h1>
        <p className="page-description">
          {isAdmin ? "Requests from everyone in the company. Line managers see their own team." : "Requests from people you line-manage."}{" "}
          Approve and their session carries on. Reject and they are checked out at the time they asked to move.
        </p>
      </div>
      <Flash msg={sp.msg} error={sp.error} />

      <section className="space-y-3" aria-labelledby="pending-heading">
        <div className="flex items-center justify-between"><h2 id="pending-heading" className="text-lg font-bold">Waiting for you</h2><span className="chip bg-amber-50 text-warn">{pending.length}</span></div>
        {pending.length === 0 && <p className="card text-sm text-muted">Nothing waiting.</p>}
        {pending.map((r) => (
          <article key={r.id} className="card grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="space-y-3">
              <div>
                <p className="font-semibold">{name(r.member_id)}</p>
                <p className="text-xs text-muted">Asked at {timeIn(r.requested_at, org.timezone)} · {r.local_date}{r.effective_from < r.requested_at ? ` · left their approved place at ${timeIn(r.effective_from, org.timezone)}` : ""}</p>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted">Place</dt><dd>{r.place_name || "—"}</dd>
                <dt className="text-muted">Address</dt><dd>{r.address || "Not found"}</dd>
                <dt className="text-muted">Reason</dt><dd>{r.reason}</dd>
                <dt className="text-muted">GPS</dt><dd>±{Math.round(r.accuracy_m ?? 0)} m</dd>
              </dl>
              <div className="flex flex-wrap items-start gap-2">
                <form action={decideRequest.bind(null, r.id, true)}><input type="hidden" name="note" value="" /><button className="btn-primary">Approve</button></form>
                <form action={decideRequest.bind(null, r.id, false)} className="flex flex-1 flex-wrap gap-2">
                  <input name="note" required minLength={3} maxLength={500} className="input min-w-48 flex-1" placeholder="Reason for rejecting" aria-label="Reason for rejecting" />
                  <button className="btn-ghost text-bad">Reject</button>
                </form>
              </div>
              <p className="text-xs text-muted">Rejecting checks {name(r.member_id)} out at {timeIn(r.effective_from, org.timezone)}.</p>
            </div>
            <MapView height={240} label={`Place requested by ${name(r.member_id)}`}
              markers={[{ lat: r.lat, lng: r.lng, tone: "warn", label: r.place_name || "Requested place" }]}
              circles={[...officeCircles, { lat: r.lat, lng: r.lng, radius: r.radius_m, tone: "warn" }]} />
          </article>
        ))}
      </section>

      {leftWithoutAsking.length > 0 && (
        <section className="space-y-3" aria-labelledby="left-heading">
          <div><h2 id="left-heading" className="text-lg font-bold">Left their approved place without asking</h2>
            <p className="text-sm text-muted">Seen outside by the 15-minute check while checked in. If they don’t ask, you can end their session at the time they left.</p></div>
          {leftWithoutAsking.map((d) => (
            <article key={d.id} className="card grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div className="space-y-2">
                <p className="font-semibold">{name(d.member_id)}</p>
                <p className="text-sm text-muted">Seen outside at {timeIn(d.departed_at, org.timezone)} · {new Date(d.departed_at).toLocaleDateString("en-NG")} · ±{Math.round(d.accuracy_m ?? 0)} m</p>
                <form action={endSessionAtDeparture.bind(null, d.id)}><button className="btn-ghost text-bad">End session at {timeIn(d.departed_at, org.timezone)}</button></form>
              </div>
              <MapView height={200} label={`Where ${name(d.member_id)} was seen`} markers={[{ lat: d.lat, lng: d.lng, tone: "bad", label: "Seen here" }]} circles={officeCircles} />
            </article>
          ))}
        </section>
      )}

      <section className="space-y-3" aria-labelledby="history-heading">
        <h2 id="history-heading" className="text-lg font-bold">Recent decisions</h2>
        {decided.length === 0 ? <p className="card text-sm text-muted">No decisions yet.</p> : (
          <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-sm"><table className="table">
            <thead><tr><th>Person</th><th>Day</th><th>Place</th><th>Result</th><th>Decided by</th><th>Note</th></tr></thead>
            <tbody>{decided.map((r) => <tr key={r.id}>
              <td className="font-semibold">{name(r.member_id)}</td>
              <td className="text-xs">{r.local_date} · asked {timeIn(r.requested_at, org.timezone)}</td>
              <td className="text-xs">{r.place_name || r.address || `${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}`}</td>
              <td><span className={`chip ${r.status === "approved" ? "bg-green-50 text-ok" : r.status === "rejected" ? "bg-red-50 text-bad" : "bg-paper text-muted"}`}>{r.status}</span>{r.status === "rejected" && <div className="mt-1 text-xs text-muted">Checked out at {timeIn(r.effective_from, org.timezone)}</div>}</td>
              <td className="text-xs">{r.decided_by ? name(r.decided_by) : "—"}</td>
              <td className="text-xs text-muted">{r.decision_note || "—"}</td>
            </tr>)}</tbody>
          </table></div>
        )}
      </section>
      <p className="text-xs text-muted">Set who line-manages whom in <Link href="/admin/staff" className="underline">People</Link>. People with no line manager are decided by admins.</p>
    </div>
  );
}
