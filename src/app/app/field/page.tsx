import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMember, todayIn, timeIn } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { OUTCOMES, minutes } from "@/lib/fieldLabels";
import { EndVisitForm, NearbySites } from "./FieldClient";

export const dynamic = "force-dynamic";

/** Field staff: today's planned visits, check in at a client site, finish the open visit, recent visits. */
export default async function FieldPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, me, org } = await requireMember();
  const { data: row } = await supabase.from("members").select("is_field").eq("id", me.id).single();
  if (!row?.is_field) redirect("/app");
  const today = todayIn(org.timezone);
  const [{ data: sites }, { data: visits }] = await Promise.all([
    supabase.from("client_sites").select("id,name,address,lat,lng,radius_m").eq("org_id", org.id).eq("active", true).order("name"),
    supabase.from("site_visits").select("id,site_id,status,planned_date,plan_note,started_at,ended_at,outcome").eq("member_id", me.id)
      .or(`planned_date.eq.${today},status.eq.in_progress,started_at.gte.${new Date(Date.now() - 7 * 86400000).toISOString()}`).order("started_at", { ascending: false, nullsFirst: true }),
  ]);
  const siteName = new Map((sites ?? []).map((s) => [s.id, s.name]));
  const open = (visits ?? []).find((v) => v.status === "in_progress");
  const planned = (visits ?? []).filter((v) => v.status === "planned" && v.planned_date === today);
  const done = (visits ?? []).filter((v) => v.status === "done");

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-6 sm:px-6">
      <div><Link href="/app" className="text-sm text-muted underline">Back to check in</Link><h1 className="page-heading mt-1">Field visits</h1></div>
      <Flash {...readFlash(sp)} />

      {open ? (
        <section className="card space-y-3 border-2 border-ink">
          <p className="eyebrow">Visit in progress</p>
          <h2 className="text-xl font-bold">{siteName.get(open.site_id)}</h2>
          <p className="text-sm text-muted">Checked in at {timeIn(open.started_at!, org.timezone)}</p>
          <EndVisitForm visitId={open.id} />
        </section>
      ) : <NearbySites sites={sites ?? []} planned={planned.map((p) => p.site_id)} />}

      <section className="card space-y-2">
        <h2 className="font-bold">Planned for today</h2>
        {planned.length === 0 ? <p className="text-sm text-muted">No visits planned for you today.</p> :
          <ul className="divide-y divide-line text-sm">{planned.map((p) => <li key={p.id} className="py-2"><b>{siteName.get(p.site_id)}</b>{p.plan_note ? <span className="block text-muted">{p.plan_note}</span> : null}</li>)}</ul>}
      </section>

      <section className="card space-y-2">
        <h2 className="font-bold">My recent visits</h2>
        {done.length === 0 ? <p className="text-sm text-muted">No visits in the last 7 days.</p> :
          <ul className="divide-y divide-line text-sm">{done.map((v) => <li key={v.id} className="flex flex-wrap justify-between gap-2 py-2">
            <span><b>{siteName.get(v.site_id) ?? "Site"}</b> · {OUTCOMES[v.outcome ?? ""] ?? "Visited"}</span>
            <span className="text-muted">{timeIn(v.started_at!, org.timezone)}{v.ended_at ? ` · ${minutes((Date.parse(v.ended_at) - Date.parse(v.started_at!)) / 60000)}` : ""}</span>
          </li>)}</ul>}
      </section>
    </main>
  );
}
