import Link from "next/link";
import { requireConsole, can, fmtDate } from "@/lib/console";
import { describeDeal } from "@/lib/deals";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { Reason } from "../Reason";
import { savePlan, setPlatform, setCurrency } from "../actions";
import { friendly } from "@/lib/errors";
import { parseOrNull, ConsolePlans } from "@/lib/jsonShapes";

export const dynamic = "force-dynamic";


export default async function PricingPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, role } = await requireConsole();
  const [{ data, error }, { data: currencies }, { data: deals }] = await Promise.all([supabase.rpc("console_plans"), supabase.rpc("console_currencies"), supabase.rpc("console_deals", {})]);
  if (error || !data) return <p className="card text-bad">{(error ? friendly(error, "console/pricing") : "No data.")}</p>;
  const d = parseOrNull(ConsolePlans, data, "console/pricing");
  if (!d) return <p className="card text-bad">This data came back in an unexpected shape, so it isn’t shown. The details were logged.</p>;
  const edit = can.ownerOnly(role);
  return (
    <div className="space-y-6">
      <div><h1 className="page-heading">Plans & pricing</h1>
        <p className="page-description">Prices are in naira per person per month. A change applies to new payments and new trials straight away; terms already paid are not changed. {edit ? "" : "Only a Global admin can change these."}</p></div>
      <Flash {...readFlash(sp)} />
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
      <section className="card space-y-3">
        <div><h2 className="font-bold">Website currencies</h2><p className="text-sm text-muted">How the website shows prices to visitors outside Nigeria. The price shown is the naira price ÷ naira per unit, plus the markup. Billing stays in naira. {can.setPlan(role) ? "" : "Only Global and Billing admins can change these."}</p></div>
        <div className="grid gap-3 lg:grid-cols-3">{(currencies ?? []).filter((c) => c.code !== "NGN").map((c) => (
          <form key={c.code} action={setCurrency.bind(null, c.code)} className="rounded-xl border border-line p-3">
            <fieldset disabled={!can.setPlan(role)} className="space-y-2">
              <p className="font-semibold">{c.code} · {c.name}</p>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label" htmlFor={`r-${c.code}`}>₦ per 1 {c.code}</label><input id={`r-${c.code}`} name="rate" type="number" step="0.01" min="0.01" defaultValue={Number(c.ngn_per_unit)} className="input" required /></div>
                <div><label className="label" htmlFor={`m-${c.code}`}>Markup %</label><input id={`m-${c.code}`} name="markup" type="number" step="0.5" min="0" max="500" defaultValue={Number(c.markup_pct)} className="input" /></div>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={c.active} /> Show on the website</label>
              <p className="text-xs text-muted">₦600 shows as about {c.symbol}{((600 / Number(c.ngn_per_unit)) * (1 + Number(c.markup_pct) / 100)).toFixed(2)}</p>
              <Reason /><button className="btn-ghost btn-sm">Save {c.code}</button>
            </fieldset>
          </form>
        ))}</div>
      </section>
      <section className="card space-y-3">
        <div><h2 className="font-bold">Company pricing deals</h2><p className="text-sm text-muted">Special prices given to single companies. Set or end a deal on the company’s page.</p></div>
        {(deals ?? []).filter((x) => x.is_active).length === 0 ? <p className="text-sm text-muted">No active deals.</p> : (
          <ul className="divide-y divide-line text-sm">{(deals ?? []).filter((x) => x.is_active).map((x) => (
            <li key={x.id} className="flex flex-wrap justify-between gap-2 py-2"><Link href={`/console/companies/${x.org_id}`} className="font-semibold underline">{x.org_name}</Link><span className="text-muted">{describeDeal(x, fmtDate)}</span></li>
          ))}</ul>
        )}
      </section>
    </div>
  );
}
