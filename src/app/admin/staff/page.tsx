import { requireMember, type Member, type Subscription } from "@/lib/session";
import { mapsLink } from "@/lib/geo";
import { inviteOne, inviteBulk, setStatus, setRole, removeMember, reviewHome } from "./actions";
import { Flash } from "@/components/Flash";
import { ConfirmAction } from "./ConfirmAction";

export const dynamic = "force-dynamic";

type PrivateLocationRow = {
  member_id: string;
  home_lat: number | null;
  home_lng: number | null;
  home_req_lat: number | null;
  home_req_lng: number | null;
  home_req_acc: number | null;
};

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, isAdmin, me } = await requireMember({ viewer: true });
  const [{ data }, { data: privateRows }, { data: sub }] = await Promise.all([
    supabase.from("members").select("id,org_id,user_id,email,full_name,role,status,team,home_status,created_at").eq("org_id", org.id).order("created_at"),
    isAdmin
      ? supabase.from("member_private_locations").select("member_id,home_lat,home_lng,home_req_lat,home_req_lng,home_req_acc").eq("org_id", org.id)
      : Promise.resolve({ data: [] as PrivateLocationRow[] }),
    isAdmin ? supabase.from("subscriptions").select("plan").eq("org_id", org.id).maybeSingle<Pick<Subscription, "plan">>() : Promise.resolve({ data: null }),
  ]);
  const privateByMember = new Map(((privateRows ?? []) as PrivateLocationRow[]).map((row) => [row.member_id, row]));
  const members = ((data ?? []) as Omit<Member, "home_lat" | "home_lng" | "home_req_lat" | "home_req_lng" | "home_req_acc" | "home_req_at">[]).map((m) => {
    const location = privateByMember.get(m.id);
    return {
      ...m,
      home_lat: location?.home_lat ?? null,
      home_lng: location?.home_lng ?? null,
      home_req_lat: location?.home_req_lat ?? null,
      home_req_lng: location?.home_req_lng ?? null,
      home_req_acc: location?.home_req_acc ?? null,
      home_req_at: null,
    } as Member;
  });
  const pending = members.filter((m) => m.status === "pending");
  const homeRequests = isAdmin ? members.filter((m) => m.home_req_lat !== null) : [];
  const isPro = sub?.plan !== "basic";
  const activeCount = members.filter((m) => m.status === "active").length;
  const totalSeats = members.filter((m) => ["active", "invited"].includes(m.status)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">People</p>
          <h1 className="page-heading">Staff directory</h1>
          <p className="page-description">{activeCount} active · {totalSeats} active or invited seats · company email only (@{org.domain})</p>
        </div>
      </div>
      <Flash msg={sp.msg} error={sp.error} />

      {isAdmin && (pending.length > 0 || homeRequests.length > 0) && (
        <div className="grid gap-4 xl:grid-cols-2">
          {pending.length > 0 && <section className="card border-amber-200 bg-[#fffdf8]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-bold">People waiting for approval</h2>
              <span className="chip bg-amber-50 text-warn">{pending.length} pending</span>
            </div>
            <ul className="divide-y divide-line">
              {pending.map((m) => <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0"><div className="font-semibold">{m.full_name || m.email}</div><div className="text-xs text-muted">{m.email} · requested {new Date(m.created_at).toLocaleDateString("en-NG")}</div></div>
                <div className="flex gap-2">
                  <form action={setStatus.bind(null, m.id, "active")}><button className="btn-primary btn-sm">Approve</button></form>
                  <ConfirmAction action={removeMember.bind(null, m.id)} prompt={`Decline ${m.full_name || m.email}'s access request? This permanently removes the pending membership. They would need to request access again.`} label="Decline" className="btn-ghost btn-sm text-bad" />
                </div>
              </li>)}
            </ul>
          </section>}
          {homeRequests.length > 0 && <section id="home-requests" className="card border-amber-200 bg-[#fffdf8]">
            <div className="mb-1 flex items-center justify-between gap-3"><h2 className="font-bold">Home location requests</h2><span className="chip bg-amber-50 text-warn">{homeRequests.length} to review</span></div>
            <p className="mb-3 text-xs leading-5 text-muted">Only admins can open precise home-location pins.</p>
            <ul className="divide-y divide-line">
              {homeRequests.map((m) => <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="font-semibold">{m.full_name || m.email}{m.home_lat !== null && <span className="chip ml-2 bg-paper text-muted">Address change</span>}</div>
                  <div className="mt-1 text-xs text-muted">±{Math.round(m.home_req_acc ?? 0)}m accuracy · <a className="font-semibold underline underline-offset-2" target="_blank" rel="noreferrer" href={mapsLink(m.home_req_lat!, m.home_req_lng!)}>Review requested pin</a>
                    {m.home_lat !== null && <> · <a className="font-semibold underline underline-offset-2" target="_blank" rel="noreferrer" href={mapsLink(m.home_lat, m.home_lng!)}>Compare current home</a></>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <form action={reviewHome.bind(null, m.id, true)}><button className="btn-primary btn-sm">Approve</button></form>
                  <form action={reviewHome.bind(null, m.id, false)}><button className="btn-ghost btn-sm">Reject</button></form>
                </div>
              </li>)}
            </ul>
          </section>}
        </div>
      )}

      {isAdmin && <div className="grid gap-4 xl:grid-cols-2">
        <form action={inviteOne} className="card space-y-4">
          <div><p className="eyebrow">Add one</p><h2 className="mt-1 text-lg font-bold">Invite a person</h2><p className="mt-1 text-sm text-muted">Invites count toward your paid-seat allowance.</p></div>
          <div><label className="label" htmlFor="invite-email">Work email</label><input id="invite-email" name="email" type="email" required className="input" placeholder={`name@${org.domain}`} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="invite-name">Full name</label><input id="invite-name" name="name" className="input" autoComplete="name" /></div>
            <div><label className="label" htmlFor="invite-team">Team (optional)</label><input id="invite-team" name="team" className="input" /></div>
          </div>
          <div><label className="label" htmlFor="invite-role">Role</label><select id="invite-role" name="role" className="input" defaultValue="staff"><option value="staff">Staff</option>{isPro && <option value="manager">Manager (reports access)</option>}<option value="admin">Admin</option></select></div>
          <button className="btn-primary w-full">Send invitation</button>
        </form>

        <form action={inviteBulk} className="card space-y-4">
          <div><p className="eyebrow">Bulk import</p><h2 className="mt-1 text-lg font-bold">Add a staff list</h2><p className="mt-1 text-sm text-muted">CSV columns: email, full name, team. Quoted commas are supported; the list is validated before any invitations are created.</p></div>
          <label className="label" htmlFor="bulk-csv">Paste CSV rows</label>
          <textarea id="bulk-csv" name="csv" rows={7} className="input resize-y font-mono text-xs" placeholder={`email,full name,team\nada@${org.domain},Ada Obi,Finance\n"benson@${org.domain}","Benson, Joseph","Operations, West"`} />
          <button className="btn-ghost w-full">Validate and invite all</button>
        </form>
      </div>}

      <section aria-label="Staff list" className="space-y-3">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">All people</h2><span className="text-xs text-muted">{members.length} records</span></div>
        <div className="hidden overflow-hidden rounded-2xl border border-line bg-white shadow-sm md:block">
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>Person</th><th>Role</th><th>Status</th><th>Home location</th>{isAdmin && <th className="text-right">Actions</th>}</tr></thead>
            <tbody>{members.filter((m) => m.status !== "pending").map((m) => <tr key={m.id}>
              <td><div className="font-semibold">{m.full_name || "—"}</div><div className="text-xs text-muted">{m.email}{m.team ? ` · ${m.team}` : ""}</div></td>
              <td>{isAdmin && m.role !== "owner" && m.id !== me.id ? <form action={setRole.bind(null, m.id)} className="flex items-center gap-1"><select name="role" aria-label={`Role for ${m.full_name || m.email}`} defaultValue={m.role} className="input min-h-9 max-w-36 py-1 text-xs"><option value="staff">Staff</option>{(isPro || m.role === "manager") && <option value="manager">Manager</option>}<option value="admin">Admin</option></select><button className="btn-ghost btn-sm">Save</button></form> : <span className="capitalize">{m.role}</span>}</td>
              <td><span className={`chip ${m.status === "active" ? "bg-green-50 text-ok" : m.status === "invited" ? "bg-amber-50 text-warn" : "bg-red-50 text-bad"}`}>{m.status === "invited" ? "Invited" : m.status}</span></td>
              <td className="text-xs">{isAdmin && m.home_lat !== null ? <a className="font-semibold underline underline-offset-2" target="_blank" rel="noreferrer" href={mapsLink(m.home_lat,m.home_lng!)}>Approved · view pin</a> : m.home_status === "approved" ? "Approved" : m.home_req_lat !== null && isAdmin ? "Request pending" : <span className="text-muted">{m.home_status === "rejected" ? "Rejected" : "Not set"}</span>}</td>
              {isAdmin && <td><div className="flex justify-end gap-1">{m.role !== "owner" && m.id !== me.id && <>
                {m.status === "disabled" ? <form action={setStatus.bind(null,m.id,"active")}><button className="btn-ghost btn-sm">Enable</button></form> : m.status === "active" ? <ConfirmAction action={setStatus.bind(null,m.id,"disabled")} prompt={`Disable ${m.full_name || m.email}? They will lose workspace access until an admin enables the membership again.`} label="Disable" className="btn-ghost btn-sm text-warn" /> : null}
                <ConfirmAction action={removeMember.bind(null,m.id)} prompt={`Remove ${m.full_name || m.email} from this organization? This permanently removes their membership and access.`} label="Remove" className="btn-ghost btn-sm text-bad" />
              </>}</div></td>}
            </tr>)}</tbody>
          </table></div>
        </div>
        <ul className="space-y-3 md:hidden">{members.filter((m) => m.status !== "pending").map((m) => <li key={m.id} className="card space-y-3 p-4">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate font-semibold">{m.full_name || "—"}</div><div className="break-all text-xs text-muted">{m.email}</div>{m.team && <div className="mt-1 text-xs text-muted">{m.team}</div>}</div><span className={`chip shrink-0 capitalize ${m.status === "active" ? "bg-green-50 text-ok" : m.status === "invited" ? "bg-amber-50 text-warn" : "bg-paper text-muted"}`}>{m.status}</span></div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-sm"><span className="capitalize text-muted">{m.role}</span><span className="text-xs text-muted">{isAdmin ? m.home_lat !== null ? "Home approved" : m.home_req_lat !== null ? "Home request pending" : m.home_status === "rejected" ? "Home rejected" : "Home not set" : m.home_status === "approved" ? "Home approved" : "Home not set"}</span></div>
          {isAdmin && m.role !== "owner" && m.id !== me.id && <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            {m.status === "disabled" ? <form action={setStatus.bind(null,m.id,"active")}><button className="btn-ghost btn-sm">Enable</button></form> : m.status === "active" ? <ConfirmAction action={setStatus.bind(null,m.id,"disabled")} prompt={`Disable ${m.full_name || m.email}? They will lose workspace access until an admin enables the membership again.`} label="Disable" className="btn-ghost btn-sm text-warn" /> : null}
            <ConfirmAction action={removeMember.bind(null,m.id)} prompt={`Remove ${m.full_name || m.email} from this organization? This permanently removes their membership and access.`} label="Remove" className="btn-ghost btn-sm text-bad" />
          </div>}
        </li>)}</ul>
      </section>
    </div>
  );
}
