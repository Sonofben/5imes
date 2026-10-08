import { requireMember, type Member, type Subscription } from "@/lib/session";
import { mapsLink } from "@/lib/geo";
import { inviteOne, inviteBulk, setStatus, setRole, removeMember, reviewHome } from "./actions";
import { Flash } from "@/components/Flash";

export const dynamic = "force-dynamic";

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, isAdmin, me } = await requireMember({ viewer: true });

  const [{ data }, { data: sub }] = await Promise.all([
    supabase.from("members").select("*").eq("org_id", org.id).order("created_at"),
    isAdmin ? supabase.from("subscriptions").select("plan").eq("org_id", org.id).maybeSingle<Pick<Subscription, "plan">>() : Promise.resolve({ data: null }),
  ]);
  const members = (data ?? []) as Member[];
  const pending = members.filter((m) => m.status === "pending");
  const homeRequests = members.filter((m) => m.home_req_lat !== null);
  const isPro = sub?.plan !== "basic";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Staff</h1>
        <p className="text-sm text-muted">
          {members.filter((m) => m.status === "active").length} active · only <b>@{org.domain}</b> emails can join
        </p>
      </div>
      <Flash msg={sp.msg} error={sp.error} />

      {isAdmin && pending.length > 0 && (
        <section className="card border-brand/40">
          <h2 className="mb-3 font-bold">Waiting for approval ({pending.length})</h2>
          <ul className="divide-y divide-line">
            {pending.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <div className="font-medium">{m.full_name || m.email}</div>
                  <div className="text-xs text-muted">{m.email} · signed in {new Date(m.created_at).toLocaleDateString("en-NG")}</div>
                </div>
                <div className="flex gap-2">
                  <form action={setStatus.bind(null, m.id, "active")}><button className="btn-primary btn-sm">Approve</button></form>
                  <form action={removeMember.bind(null, m.id)}><button className="btn-ghost btn-sm">Decline</button></form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isAdmin && homeRequests.length > 0 && (
        <section className="card border-brand/40">
          <h2 className="mb-1 font-bold">Home location requests ({homeRequests.length})</h2>
          <p className="mb-3 text-xs text-muted">Open the map to check the pin is a home address before approving.</p>
          <ul className="divide-y divide-line">
            {homeRequests.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <div className="font-medium">
                    {m.full_name || m.email} {m.home_lat !== null && <span className="chip ml-1 bg-amber-50 text-warn">Change of address</span>}
                  </div>
                  <div className="text-xs text-muted">
                    ±{Math.round(m.home_req_acc ?? 0)}m accuracy ·{" "}
                    <a className="underline" target="_blank" rel="noreferrer" href={mapsLink(m.home_req_lat!, m.home_req_lng!)}>
                      View on map
                    </a>
                    {m.home_lat !== null && (
                      <>
                        {" "}·{" "}
                        <a className="underline" target="_blank" rel="noreferrer" href={mapsLink(m.home_lat, m.home_lng!)}>
                          Current home
                        </a>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <form action={reviewHome.bind(null, m.id, true)}><button className="btn-primary btn-sm">Approve</button></form>
                  <form action={reviewHome.bind(null, m.id, false)}><button className="btn-ghost btn-sm">Reject</button></form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isAdmin && (
        <div className="grid gap-4 md:grid-cols-2">
          <form action={inviteOne} className="card space-y-3">
            <h2 className="font-bold">Invite a person</h2>
            <input name="email" type="email" required className="input" placeholder={`name@${org.domain}`} />
            <div className="grid grid-cols-2 gap-2">
              <input name="name" className="input" placeholder="Full name" />
              <input name="team" className="input" placeholder="Team (optional)" />
            </div>
            <select name="role" className="input" defaultValue="staff">
              <option value="staff">Staff</option>
              {isPro && <option value="manager">Manager (sees reports)</option>}
              <option value="admin">Admin</option>
            </select>
            <button className="btn-primary w-full">Send invite</button>
          </form>

          <form action={inviteBulk} className="card space-y-3">
            <h2 className="font-bold">Add many at once</h2>
            <p className="text-xs text-muted">One per line: <code>email, full name, team</code>. Paste straight from Excel (save as CSV).</p>
            <textarea
              name="csv"
              rows={5}
              className="input font-mono text-xs"
              placeholder={`ada@${org.domain}, Ada Obi, Finance\ntunde@${org.domain}, Tunde Bello, Sales`}
            />
            <button className="btn-ghost w-full">Add all</button>
          </form>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
              <th>Status</th>
              <th>Home</th>
              {isAdmin && <th className="text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {members
              .filter((m) => m.status !== "pending")
              .map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="font-medium">{m.full_name || "—"}</div>
                    <div className="text-xs text-muted">{m.email}{m.team ? ` · ${m.team}` : ""}</div>
                  </td>
                  <td>
                    {isAdmin && m.role !== "owner" && m.id !== me.id ? (
                      <form action={setRole.bind(null, m.id)} className="flex gap-1">
                        <select name="role" defaultValue={m.role} className="input py-1 text-xs">
                          <option value="staff">Staff</option>
                          {(isPro || m.role === "manager") && <option value="manager">Manager</option>}
                          <option value="admin">Admin</option>
                        </select>
                        <button className="btn-ghost btn-sm">Save</button>
                      </form>
                    ) : (
                      <span className="capitalize">{m.role}</span>
                    )}
                  </td>
                  <td>
                    <span
                      className={`chip ${
                        m.status === "active" ? "bg-green-50 text-ok" : m.status === "invited" ? "bg-amber-50 text-warn" : "bg-red-50 text-bad"
                      }`}
                    >
                      {m.status === "invited" ? "Invited — not signed in yet" : m.status}
                    </span>
                  </td>
                  <td className="text-xs">
                    {m.home_lat !== null ? (
                      <a className="underline" target="_blank" rel="noreferrer" href={mapsLink(m.home_lat, m.home_lng!)}>Approved</a>
                    ) : m.home_req_lat !== null ? (
                      "Pending"
                    ) : (
                      <span className="text-muted">Not set</span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="text-right">
                      {m.role !== "owner" && m.id !== me.id && (
                        <div className="flex justify-end gap-1">
                          {m.status === "disabled" ? (
                            <form action={setStatus.bind(null, m.id, "active")}><button className="btn-ghost btn-sm">Enable</button></form>
                          ) : m.status === "active" ? (
                            <form action={setStatus.bind(null, m.id, "disabled")}><button className="btn-ghost btn-sm">Disable</button></form>
                          ) : null}
                          <form action={removeMember.bind(null, m.id)}><button className="btn-ghost btn-sm text-bad">Remove</button></form>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
