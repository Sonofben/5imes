import { requireMember, type Subscription } from "@/lib/session";
import { mapsLink } from "@/lib/geo";
import { Flash } from "@/components/Flash";
import { LocationPicker } from "@/components/maps/LocationPicker";
import { MapView } from "@/components/maps/MapView";
import { addLocation, updateRadius, deleteLocation } from "./actions";

export const dynamic = "force-dynamic";

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; error?: string; welcome?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, org } = await requireMember({ admin: true });
  const [{ data: locations }, { data: sub }] = await Promise.all([
    supabase.from("locations").select("*").eq("org_id", org.id).order("created_at"),
    supabase.from("subscriptions").select("plan").eq("org_id", org.id).maybeSingle<Pick<Subscription, "plan">>(),
  ]);
  const isBasic = sub?.plan === "basic";
  const canAdd = !isBasic || (locations?.length ?? 0) < 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Office locations</h1>
        <p className="text-sm text-muted">
          Staff can only check in at the office when they are inside the radius. Home locations are pinned by each person
          and approved by you in Staff.
        </p>
      </div>
      <Flash msg={sp.msg} error={sp.error} />

      {(locations ?? []).length > 0 && (
        <MapView
          height={280}
          label="Map of your offices"
          markers={(locations ?? []).map((l) => ({ lat: l.lat, lng: l.lng, label: l.name, tone: "brand" as const }))}
          circles={(locations ?? []).map((l) => ({ lat: l.lat, lng: l.lng, radius: l.radius_m, tone: "brand" as const }))}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          {(locations ?? []).length === 0 && <div className="card text-sm text-muted">No office yet. Add one on the right.</div>}
          {(locations ?? []).map((l) => (
            <div key={l.id} className="card space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold">{l.name}</div>
                  {l.address && <p className="text-sm text-muted">{l.address}</p>}
                  <a className="text-xs text-muted underline" target="_blank" rel="noreferrer" href={mapsLink(l.lat, l.lng)}>
                    Open in Google Maps ({l.lat.toFixed(5)}, {l.lng.toFixed(5)})
                  </a>
                </div>
                <form action={deleteLocation.bind(null, l.id)}>
                  <button className="btn-ghost btn-sm text-bad">Remove</button>
                </form>
              </div>
              <MapView height={150} label={`Map of ${l.name}`} markers={[{ lat: l.lat, lng: l.lng, tone: "brand" }]} circles={[{ lat: l.lat, lng: l.lng, radius: l.radius_m, tone: "brand" }]} />
              {isBasic ? (
                <p className="text-xs text-muted">Radius: 200m (custom radius is a Pro feature)</p>
              ) : (
                <form action={updateRadius.bind(null, l.id)} className="flex items-center gap-2">
                  <label className="text-xs text-muted">Radius</label>
                  <input name="radius_m" type="number" min={50} max={1000} step={10} defaultValue={l.radius_m} className="input w-28 py-1.5" />
                  <span className="text-xs text-muted">m</span>
                  <button className="btn-ghost btn-sm">Save</button>
                </form>
              )}
            </div>
          ))}
        </div>

        {canAdd ? (
          <form action={addLocation.bind(null, org.id)} className="card space-y-3">
            <h2 className="font-bold">Add an office</h2>
            <input name="name" className="input" placeholder="e.g. Head office, Ikeja" required />
            <LocationPicker radiusEditable={!isBasic} defaultRadius={200} />
            <button className="btn-primary w-full">Add office</button>
          </form>
        ) : (
          <div className="card text-sm">
            The Basic plan includes one office. <a href="/admin/billing" className="underline">Upgrade to Pro</a> for branches.
          </div>
        )}
      </div>
    </div>
  );
}
