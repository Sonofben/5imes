import Link from "next/link";
import { requireMember, todayIn } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { visitTime } from "@/lib/visitors";
import { InviteFormCard } from "@/app/visitors/InviteFormCard";
import { inviteMyVisitor, cancelMyVisit } from "./actions";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = { expected: "Expected", on_site: "Arrived", left: "Left", cancelled: "Cancelled", denied: "Refused at reception" };

/** Staff: invite visitors you're hosting and see when they arrive. */
export default async function MyVisitors({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const flash = readFlash(await searchParams);
  const { supabase, org, me } = await requireMember();
  const { data: premium } = await supabase.rpc("org_has_premium", { p_org: org.id });
  const [{ data: offices }, { data: visits }] = await Promise.all([
    supabase.from("locations").select("id,name").eq("org_id", org.id).order("name"),
    supabase.from("visits").select("id,visitor_name,visitor_company,status,expected_at,signed_in_at,code,location_id")
      .eq("host_member_id", me.id).order("created_at", { ascending: false }).limit(30),
  ]);
  const officeOf = new Map((offices ?? []).map((o) => [o.id, o.name]));
  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pb-12 pt-5 sm:px-6">
      <Link href="/app" className="text-sm text-muted underline">← Back</Link>
      <h1 className="page-heading">My visitors</h1>
      <Flash {...flash} />
      {!premium ? <p className="card text-sm text-muted">Visitor management isn’t switched on for {org.name}. An admin can turn it on with the Premium plan.</p> : <>
        {(offices ?? []).length > 0
          ? <InviteFormCard action={inviteMyVisitor} offices={offices ?? []} meId={me.id} today={todayIn(org.timezone)} />
          : <p className="card text-sm text-muted">Your company hasn’t added an office yet.</p>}
        <section className="card space-y-2">
          <h2 className="font-bold">Your visitors</h2>
          {(visits ?? []).length === 0 ? <p className="text-sm text-muted">No visitors yet.</p> :
            <ul className="divide-y divide-line">{(visits ?? []).map((v) => <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <div><b>{v.visitor_name}</b>{v.visitor_company ? <span className="text-muted"> · {v.visitor_company}</span> : null}
                <div className="text-xs text-muted">{LABEL[v.status] ?? v.status} · {visitTime(v.signed_in_at ?? v.expected_at, org.timezone)} · {officeOf.get(v.location_id ?? "") ?? ""}{v.status === "expected" ? <> · code <span className="font-mono">{v.code}</span></> : null}</div></div>
              {v.status === "expected" && <form action={cancelMyVisit.bind(null, v.id)}><button className="btn-ghost btn-sm">Cancel</button></form>}
            </li>)}</ul>}
        </section>
      </>}
    </main>
  );
}
