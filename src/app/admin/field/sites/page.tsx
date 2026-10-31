import Link from "next/link";
import { requireMember } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { PlanLock } from "@/components/PlanLock";
import { importSites, saveSite, setField } from "../actions";

export const dynamic = "force-dynamic";

/** Client sites (managers and admins) and who is field staff (admins). */
export default async function SitesPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, isAdmin } = await requireMember({ viewer: true });
  const { data: allowed } = await supabase.rpc("org_has_field", { p_org: org.id });
  if (!allowed) return <PlanLock isAdmin={isAdmin} plan="Premium" title="Field staff is part of Premium, or an add-on for Pro" />;
  const [{ data: sites }, { data: people }, { data: addon }] = await Promise.all([
    supabase.from("client_sites").select("id,name,address,lat,lng,radius_m,contact_name,contact_phone,active").eq("org_id", org.id).order("active", { ascending: false }).order("name"),
    isAdmin ? supabase.from("members").select("id,full_name,email,team,is_field").eq("org_id", org.id).eq("status", "active").order("full_name") : Promise.resolve({ data: [] }),
    supabase.from("organizations").select("field_addon_seats").eq("id", org.id).single(),
  ]);
  const { data: plan } = await supabase.rpc("org_plan_now", { p_org: org.id });
  const fieldCount = (people ?? []).filter((p) => p.is_field).length;

  return (
    <div className="space-y-6">
      <div><Link href="/admin/field" className="text-sm text-muted underline">Back to field visits</Link><h1 className="page-heading mt-1">Client sites and field staff</h1></div>
      <Flash {...readFlash(sp)} />

      {isAdmin && <section className="card space-y-3">
        <div><h2 className="font-bold">Field staff</h2><p className="text-sm text-muted">People who visit clients: sales reps, engineers, officers.{plan === "pro" ? ` Your add-on covers ${addon?.field_addon_seats ?? 0} people (${fieldCount} used).` : ""}</p></div>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{(people ?? []).map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm">
            <span className="min-w-0 truncate"><b>{p.full_name || p.email}</b>{p.team ? <span className="text-muted"> · {p.team}</span> : null}</span>
            <form action={setField.bind(null, p.id, !p.is_field)}><button className={p.is_field ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>{p.is_field ? "Field staff" : "Make field staff"}</button></form>
          </li>))}</ul>
      </section>}

      <section className="space-y-3">
        <h2 className="font-bold">Client sites</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {(sites ?? []).map((s) => <SiteForm key={s.id} s={s} />)}
          <SiteForm />
        </div>
      </section>

      <form action={importSites} className="card space-y-3">
        <div><h2 className="font-bold">Import sites from a spreadsheet</h2><p className="text-sm text-muted">Columns: name, address, latitude, longitude, area in metres (optional, 150 if empty), contact name, contact phone. To get latitude and longitude, right-click the place in Google Maps and click the numbers to copy them.</p></div>
        <textarea name="csv" rows={4} className="input font-mono text-xs" placeholder={"name,address,latitude,longitude,area,contact name,contact phone\nShoprite Lekki,Admiralty Way,6.4400,3.4700,150,Mrs Bello,0803 000 0000"} />
        <div className="flex justify-end"><button className="btn-primary">Import</button></div>
      </form>
    </div>
  );
}

type Site = { id: string; name: string; address: string | null; lat: number; lng: number; radius_m: number; contact_name: string | null; contact_phone: string | null; active: boolean };

function SiteForm({ s }: { s?: Site }) {
  const k = s?.id ?? "new";
  return (
    <form action={saveSite.bind(null, s?.id ?? null)} className={`card space-y-2 ${s ? (s.active ? "" : "opacity-60") : "border-dashed"}`}>
      <div className="flex items-center justify-between gap-2"><h3 className="font-bold">{s ? s.name : "Add a client site"}</h3>
        {s && <a className="text-xs underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lng}#map=17/${s.lat}/${s.lng}`}>Map</a>}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div><label className="label" htmlFor={`s-name-${k}`}>Name</label><input id={`s-name-${k}`} name="name" required minLength={2} maxLength={120} defaultValue={s?.name ?? ""} className="input" /></div>
        <div><label className="label" htmlFor={`s-addr-${k}`}>Address</label><input id={`s-addr-${k}`} name="address" maxLength={300} defaultValue={s?.address ?? ""} className="input" /></div>
        <div><label className="label" htmlFor={`s-lat-${k}`}>Latitude</label><input id={`s-lat-${k}`} name="lat" required inputMode="decimal" defaultValue={s?.lat ?? ""} className="input" placeholder="6.4400" /></div>
        <div><label className="label" htmlFor={`s-lng-${k}`}>Longitude</label><input id={`s-lng-${k}`} name="lng" required inputMode="decimal" defaultValue={s?.lng ?? ""} className="input" placeholder="3.4700" /></div>
        <div><label className="label" htmlFor={`s-rad-${k}`}>Area (metres)</label><input id={`s-rad-${k}`} name="radius" type="number" min={30} max={2000} defaultValue={s?.radius_m ?? 150} className="input" /></div>
        <div><label className="label" htmlFor={`s-cn-${k}`}>Contact</label><input id={`s-cn-${k}`} name="contact_name" maxLength={120} defaultValue={s?.contact_name ?? ""} className="input" /></div>
        <div><label className="label" htmlFor={`s-cp-${k}`}>Contact phone</label><input id={`s-cp-${k}`} name="contact_phone" maxLength={40} defaultValue={s?.contact_phone ?? ""} className="input" /></div>
        {s && <div><label className="label" htmlFor={`s-act-${k}`}>Status</label><select id={`s-act-${k}`} name="active" defaultValue={s.active ? "on" : "off"} className="input"><option value="on">Active</option><option value="off">Not visited any more</option></select></div>}
      </div>
      <div className="flex justify-end"><button className="btn-primary btn-sm">{s ? "Save" : "Add site"}</button></div>
    </form>
  );
}
