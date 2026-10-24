import { redirect } from "next/navigation";
import { requireMember } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { visitTime } from "@/lib/visitors";
import { blockVisitor, unblockVisitor } from "../actions";

export const dynamic = "force-dynamic";

/** People who must not be let in. Matching ignores capitals, spaces and phone formatting. */
export default async function BlocklistPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  // Reception-only staff go back to the desk; admins must also pass two-factor (requireMember admin).
  if (!(await requireMember({ desk: true })).isAdmin) redirect("/visitors");
  const { supabase, org } = await requireMember({ admin: true });
  const flash = readFlash(sp);
  const { data: rows } = await supabase.from("visitor_blocklist").select("id,name,email,phone,reason,created_at").eq("org_id", org.id).order("created_at", { ascending: false });
  return (
    <div className="space-y-4">
      <Flash {...flash} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <form action={blockVisitor} className="card space-y-3">
          <div><h2 className="font-bold">Block someone</h2><p className="text-sm text-muted">If a visitor’s name, email or phone matches — on their phone, at the tablet or at the desk — they are told to speak to reception and are not let in.</p></div>
          <div><label className="label" htmlFor="b-name">Full name</label><input id="b-name" name="name" maxLength={120} className="input" /></div>
          <div><label className="label" htmlFor="b-email">Email</label><input id="b-email" name="email" type="email" maxLength={254} className="input" /></div>
          <div><label className="label" htmlFor="b-phone">Phone</label><input id="b-phone" name="phone" type="tel" maxLength={30} className="input" /></div>
          <div><label className="label" htmlFor="b-reason">Reason (only admins see this)</label><input id="b-reason" name="reason" maxLength={300} className="input" /></div>
          <button className="btn-primary">Add to blocklist</button>
        </form>
        <section className="card space-y-2"><h2 className="font-bold">Blocklist</h2>
          {(rows ?? []).length === 0 ? <p className="text-sm text-muted">Nobody is blocked.</p> :
            <ul className="divide-y divide-line">{(rows ?? []).map((b) => <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <div><b>{[b.name, b.email, b.phone].filter(Boolean).join(" · ")}</b><div className="text-xs text-muted">{b.reason ?? "No reason given"} · added {visitTime(b.created_at, org.timezone)}</div></div>
              <form action={unblockVisitor.bind(null, b.id)}><button className="btn-ghost btn-sm">Remove</button></form>
            </li>)}</ul>}
        </section>
      </div>
    </div>
  );
}
