import { redirect } from "next/navigation";
import { requireMember, todayIn } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";
import { photoLinks, reasonLabel, visitTime, zonedIso } from "@/lib/visitors";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  expected: { label: "Expected", tone: "bg-paper text-ink" },
  waiting: { label: "Waiting", tone: "bg-amber-50 text-warn" },
  on_site: { label: "On site", tone: "bg-green-50 text-ok" },
  left: { label: "Left", tone: "bg-paper text-muted" },
  cancelled: { label: "Cancelled", tone: "bg-paper text-muted" },
  denied: { label: "Turned away", tone: "bg-red-50 text-bad" },
};

/** Every visit in a period, for managers and admins; photos for admins; CSV download (recorded in the audit trail). */
export default async function VisitorLogPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, org, isAdmin, isViewer } = await requireMember({ desk: true });
  if (!isViewer) redirect("/visitors");
  const today = todayIn(org.timezone);
  const valid = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  const to = valid(sp.to) ?? today;
  const from = valid(sp.from) ?? new Date(new Date(`${to}T00:00:00Z`).getTime() - 6 * 86400000).toISOString().slice(0, 10);
  const q = (sp.q ?? "").trim().slice(0, 60).replace(/[%,()"\\*]/g, "");
  let query = supabase.from("visits").select("id,visitor_name,visitor_company,visitor_email,visitor_phone,host_member_id,host_hint,location_id,status,reason,expected_at,arrived_at,signed_in_at,signed_out_at,walk_in,auto_signed_out,personal_data_deleted_at,denied_reason")
    .eq("org_id", org.id).gte("created_at", zonedIso(from, "00:00", org.timezone)!)
    .lt("created_at", new Date(new Date(zonedIso(to, "00:00", org.timezone)!).getTime() + 86400000).toISOString())
    .order("created_at", { ascending: false }).limit(500);
  if (q) query = query.or(`visitor_name.ilike.%${q}%,visitor_company.ilike.%${q}%`);
  const [{ data: rows }, { data: hosts }, { data: locations }] = await Promise.all([
    query, supabase.rpc("vms_hosts"), supabase.from("locations").select("id,name").eq("org_id", org.id),
  ]);
  const nameOf = new Map((hosts ?? []).map((h) => [h.id, h.name]));
  const officeOf = new Map((locations ?? []).map((l) => [l.id, l.name]));
  const admin = isAdmin ? createAdminClient() : null;
  let photos = new Map<string, string>();
  if (admin && rows?.length) {
    const { data: withPhoto } = await admin.from("visits").select("id,photo_path").eq("org_id", org.id).in("id", rows.map((r) => r.id)).not("photo_path", "is", null);
    const links = await photoLinks(admin, (withPhoto ?? []).map((p) => p.photo_path!));
    photos = new Map((withPhoto ?? []).flatMap((p) => (links.get(p.photo_path!) ? [[p.id, links.get(p.photo_path!)!] as const] : [])));
  }
  const exportHref = `/visitors/export?${new URLSearchParams({ from, to, ...(q ? { q } : {}) })}`;
  return (
    <div className="space-y-4">
      <form className="card flex flex-wrap items-end gap-3">
        <div><label className="label" htmlFor="l-from">From</label><input id="l-from" name="from" type="date" defaultValue={from} className="input" /></div>
        <div><label className="label" htmlFor="l-to">To</label><input id="l-to" name="to" type="date" defaultValue={to} className="input" /></div>
        <div className="min-w-48 flex-1"><label className="label" htmlFor="l-q">Name or company</label><input id="l-q" name="q" defaultValue={q} className="input" /></div>
        <button className="btn-primary">Show</button><a href={exportHref} className="btn-ghost">Download CSV</a>
      </form>
      <div className="card overflow-x-auto p-0"><table className="table min-w-[900px]">
        <thead><tr><th>Visitor</th><th>Reason</th><th>Host</th><th>Office</th><th>Status</th><th>In</th><th>Out</th></tr></thead>
        <tbody>{(rows ?? []).length === 0 ? <tr><td colSpan={7} className="text-muted">No visits in this period.</td></tr> : (rows ?? []).map((v) => <tr key={v.id}>
          <td><div className="flex items-center gap-2">{photos.get(v.id) && <img src={photos.get(v.id)} alt="" className="h-9 w-9 rounded-full object-cover" />}
            <div><b>{v.visitor_name}</b>{v.walk_in && <span className="chip ml-1 bg-paper text-muted">Walk-in</span>}<div className="text-xs text-muted">{[v.visitor_company, v.visitor_email, v.visitor_phone].filter(Boolean).join(" · ") || (v.personal_data_deleted_at ? "Details deleted" : "")}</div></div></div></td>
          <td className="text-xs">{v.walk_in ? reasonLabel(v.reason) : "Invited"}</td>
          <td>{nameOf.get(v.host_member_id ?? "") ?? (v.host_hint ? <span className="text-muted">wanted {v.host_hint}</span> : "—")}</td><td>{officeOf.get(v.location_id ?? "") ?? "—"}</td>
          <td><span className={`chip ${STATUS_LABELS[v.status]?.tone ?? ""}`}>{STATUS_LABELS[v.status]?.label ?? v.status}</span></td>
          <td className="text-xs">{visitTime(v.signed_in_at ?? v.arrived_at ?? (v.status === "expected" ? v.expected_at : null), org.timezone) || "—"}</td>
          <td className="text-xs">{visitTime(v.signed_out_at, org.timezone) || "—"}{v.auto_signed_out ? " (auto)" : ""}</td>
        </tr>)}</tbody></table></div>
    </div>
  );
}
