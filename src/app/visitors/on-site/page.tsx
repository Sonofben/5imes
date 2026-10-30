import Link from "next/link";
import { requireMember } from "@/lib/session";
import { visitTime } from "@/lib/visitors";
import { PrintButton } from "./PrintButton";

import { PlanLock } from "@/components/PlanLock";
import { visitorTier } from "@/lib/plans";
export const dynamic = "force-dynamic";

/** Everyone on site now — staff checked in at an office and signed-in visitors — for fire drills and emergencies. */
export default async function OnSitePage() {
  const { supabase, org, isAdmin } = await requireMember({ desk: true });
  if ((await visitorTier(supabase, org.id)) !== "premium") {
    return <PlanLock isAdmin={isAdmin} plan="Premium" title="Fire-drill roll call is part of Premium" points={[
      "One printable list of everyone on site right now: staff checked in at the office and visitors signed in.",
      "Grouped by office, ready for a fire drill or an emergency.",
    ]} />;
  }
  const [{ data: rows, error }, { data: locations }] = await Promise.all([
    supabase.rpc("vms_on_site", { p_location: null }),
    supabase.from("locations").select("id,name").eq("org_id", org.id).order("name"),
  ]);
  const byOffice = (locations ?? []).map((l) => ({ ...l, people: (rows ?? []).filter((r) => r.location_id === l.id) }));
  const now = visitTime(new Date().toISOString(), org.timezone);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div><Link href="/visitors" className="text-sm text-muted underline">← Desk</Link><h1 className="page-heading mt-1">Who’s on site</h1></div>
        <PrintButton />
      </div>
      <p className="text-sm text-muted">{org.name} · as of {now}. Staff are those checked in at an office in the last 18 hours; visitors are those signed in and not yet signed out.</p>
      {error && <p className="card text-bad">This list could not be loaded. Try again.</p>}
      {byOffice.map((o) => (
        <section key={o.id} className="card break-inside-avoid space-y-2">
          <h2 className="font-bold">{o.name} <span className="text-sm font-normal text-muted">· {o.people.filter((p) => p.kind === "staff").length} staff, {o.people.filter((p) => p.kind === "visitor").length} visitors</span></h2>
          {o.people.length === 0 ? <p className="text-sm text-muted">Nobody recorded on site.</p> :
            <table className="table"><thead><tr><th>Name</th><th>Type</th><th>Details</th><th>Since</th><th className="print:table-cell hidden">Accounted for</th></tr></thead>
              <tbody>{o.people.map((p, i) => <tr key={i}><td className="font-medium">{p.name}</td><td className="capitalize">{p.kind}</td><td className="text-xs">{p.detail ?? ""}</td><td className="text-xs">{visitTime(p.since, org.timezone)}</td><td className="hidden print:table-cell">☐</td></tr>)}</tbody></table>}
        </section>
      ))}
    </div>
  );
}
