import { requireConsole, can } from "@/lib/console";
import { Flash } from "@/components/Flash";
import { Reason } from "../Reason";
import { savePlan, setPlatform } from "../actions";

export const dynamic = "force-dynamic";

type Plan = { id: "basic" | "pro"; name: string; pricePerSeat: number; blurb: string; features: string[]; maxLocations: number | null };
type Data = { trial_days: number; plans: Plan[]; maintenance_mode: boolean; maintenance_message: string | null };

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, role } = await requireConsole();
  const { data, error } = await supabase.rpc("console_plans");
  if (error || !data) return <p className="card text-bad">{error?.message ?? "No data."}</p>;
  const d = data as Data;
  const edit = can.ownerOnly(role);
  return (
    <div className="space-y-6">
      <div><h1 className="page-heading">Plans & pricing</h1>
        <p className="page-description">Prices are in naira per person per month. A change applies to new payments and new trials straight away; terms already paid are not changed. {edit ? "" : "Only a Global admin can change these."}</p></div>
      <Flash msg={sp.msg} error={sp.error} />
      <div className="grid gap-4 lg:grid-cols-2">
        {d.plans.map((p) => (
          <form key={p.id} action={savePlan.bind(null, p.id)} className="card space-y-3">
            <fieldset disabled={!edit} className="space-y-3">
              <h2 className="font-bold capitalize">{p.id} plan</h2>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label" htmlFor={`${p.id}-name`}>Name shown</label><input id={`${p.id}-name`} name="name" required defaultValue={p.name} className="input" /></div>
                <div><label className="label" htmlFor={`${p.id}-price`}>Price (₦ / person / month)</label><input id={`${p.id}-price`} name="price" type="number" min={1} required defaultValue={p.pricePerSeat} className="input" /></div>
              </div>
              <div><label className="label" htmlFor={`${p.id}-blurb`}>Short description</label><input id={`${p.id}-blurb`} name="blurb" maxLength={200} defaultValue={p.blurb} className="input" /></div>
              <div><label className="label" htmlFor={`${p.id}-feat`}>Features (one per line, shown on the pricing page)</label><textarea id={`${p.id}-feat`} name="features" rows={6} defaultValue={p.features.join("\n")} className="input" /></div>
              <div><label className="label" htmlFor={`${p.id}-max`}>Office locations allowed (empty = unlimited)</label><input id={`${p.id}-max`} name="max_locations" type="number" min={1} defaultValue={p.maxLocations ?? ""} className="input" /></div>
              {edit && <><Reason /><button className="btn-primary">Save {p.name}</button></>}
            </fieldset>
          </form>
        ))}
      </div>
      <form action={setPlatform.bind(null, "/console/pricing")} className="card max-w-xl space-y-3">
        <fieldset disabled={!edit} className="space-y-3">
          <h2 className="font-bold">Free trial</h2>
          <div><label className="label" htmlFor="trial">Pro trial length for new companies (days)</label><input id="trial" name="trial_days" type="number" min={1} max={90} required defaultValue={d.trial_days} className="input" /></div>
          {d.maintenance_mode && <input type="hidden" name="maintenance" value="on" />}
          <input type="hidden" name="maintenance_message" value={d.maintenance_message ?? ""} />
          {edit && <><Reason /><button className="btn-primary">Save trial length</button></>}
        </fieldset>
      </form>
    </div>
  );
}
