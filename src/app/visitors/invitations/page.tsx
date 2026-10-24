import Link from "next/link";
import { requireMember, todayIn } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { emailEnabled } from "@/lib/email";
import { visitTime } from "@/lib/visitors";
import { InviteFormCard } from "../InviteFormCard";
import { cancelVisit, inviteVisitor } from "../actions";

export const dynamic = "force-dynamic";

/** Invite a visitor for any colleague, and see upcoming invitations. */
export default async function InvitationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, org, me, isAdmin } = await requireMember({ desk: true });
  const flash = readFlash(sp);
  const [{ data: locations }, { data: hosts }, { data: upcoming }] = await Promise.all([
    supabase.from("locations").select("id,name").eq("org_id", org.id).order("name"),
    supabase.rpc("vms_hosts"),
    supabase.from("visits").select("id,visitor_name,visitor_company,visitor_email,host_member_id,expected_at,code")
      .eq("org_id", org.id).eq("status", "expected").gte("expected_at", new Date(Date.now() - 12 * 3600 * 1000).toISOString()).order("expected_at").limit(200),
  ]);
  const people = (hosts ?? []).map((h) => ({ id: h.id, full_name: h.name, email: "", team: h.team }));
  const nameOf = new Map((hosts ?? []).map((h) => [h.id, h.name]));
  const offices = locations ?? [];

  return (
    <div className="space-y-5">
      <Flash {...flash} />
      {!emailEnabled() && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-warn">Invitation emails are off: the server has no email settings yet{isAdmin ? " (RESEND_API_KEY and EMAIL_FROM)" : ""}. Invitations still work — give visitors their code.</p>}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {offices.length
          ? <InviteFormCard action={inviteVisitor} offices={offices} people={people} meId={me.id} today={todayIn(org.timezone)} />
          : <p className="card text-sm">Add an office under <Link className="underline" href="/admin/locations">Locations</Link> first.</p>}
        <section className="card space-y-2">
          <div className="flex items-center justify-between"><h2 className="font-bold">Upcoming invitations</h2><span className="text-sm text-muted">{(upcoming ?? []).length}</span></div>
          {(upcoming ?? []).length === 0 ? <p className="text-sm text-muted">No upcoming visitors.</p> :
            <ul className="divide-y divide-line">{(upcoming ?? []).map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div className="min-w-0"><b>{v.visitor_name}</b>{v.visitor_company && <span className="text-muted"> · {v.visitor_company}</span>}
                  <div className="text-xs text-muted">{visitTime(v.expected_at, org.timezone)} · host {nameOf.get(v.host_member_id ?? "") ?? "—"} · code <span className="font-mono">{v.code}</span>{v.visitor_email ? "" : " · no email"}</div></div>
                <form action={cancelVisit.bind(null, v.id)}><button className="btn-ghost btn-sm">Cancel</button></form>
              </li>))}</ul>}
        </section>
      </div>
    </div>
  );
}
