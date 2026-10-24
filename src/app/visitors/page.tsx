import Link from "next/link";
import { requireMember, todayIn } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";
import { Flash } from "@/components/Flash";
import { AutoRefresh } from "@/components/AutoRefresh";
import { readFlash } from "@/lib/flash";
import { friendly } from "@/lib/errors";
import { DeskVisit, parseOrNull } from "@/lib/jsonShapes";
import { purgeExpiredVisitors, reasonLabel, visitTime, zonedIso } from "@/lib/visitors";
import { DeskCodeForm } from "./DeskCodeForm";
import { admitVisitor, cancelVisit, signOutVisitor, turnAwayVisitor } from "./actions";

export const dynamic = "force-dynamic";

type Host = { id: string; name: string; team: string | null };

/**
 * The reception desk: find a visitor by code, the queue of people waiting to be let in (from their
 * phones or the tablet), who's expected today, and who's on site. Refreshes itself every 15 seconds.
 */
export default async function DeskPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, org } = await requireMember({ desk: true });
  const flash = readFlash(sp);
  const admin = createAdminClient();
  if (admin) await purgeExpiredVisitors(admin);

  const today = todayIn(org.timezone);
  const start = zonedIso(today, "00:00", org.timezone)!;
  const end = new Date(new Date(start).getTime() + 24 * 3600 * 1000).toISOString();
  const code = (sp.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

  const [{ data: hostRows }, { data: waiting }, { data: expected }, { data: onSite }, { data: locations }, found] = await Promise.all([
    supabase.rpc("vms_hosts"),
    supabase.from("visits").select("id,visitor_name,visitor_company,visitor_phone,host_member_id,host_hint,reason,walk_in,arrived_at,arrival_source,code,location_id")
      .eq("org_id", org.id).eq("status", "waiting").order("arrived_at"),
    supabase.from("visits").select("id,visitor_name,visitor_company,host_member_id,expected_at,code,location_id")
      .eq("org_id", org.id).eq("status", "expected").gte("expected_at", start).lt("expected_at", end).order("expected_at"),
    supabase.from("visits").select("id,visitor_name,visitor_company,host_member_id,signed_in_at,walk_in,location_id,decided_by,sign_in_source")
      .eq("org_id", org.id).eq("status", "on_site").order("signed_in_at", { ascending: false }),
    supabase.from("locations").select("id,name").eq("org_id", org.id),
    code ? supabase.rpc("vms_desk_find", { p_code: code }) : Promise.resolve(null),
  ]);
  const hosts: Host[] = hostRows ?? [];
  const nameOf = new Map(hosts.map((h) => [h.id, h.name]));
  const officeOf = new Map((locations ?? []).map((l) => [l.id, l.name]));
  const manyOffices = (locations ?? []).length > 1;
  const minsSince = (iso: string | null) => (iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)) : 0);
  const foundVisit = found && !found.error ? parseOrNull(DeskVisit, found.data, "visitors/desk-find") : null;
  const findError = found?.error ? friendly(found.error, "visitors/desk-find") : null;

  return (
    <div className="space-y-5">
      <AutoRefresh seconds={15} />
      <Flash {...flash} />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="space-y-5">
          <section className="card space-y-3">
            <div><h1 className="text-lg font-bold">Visitor has a code?</h1><p className="text-sm text-muted">Type it, or scan their QR with this device’s camera.</p></div>
            <DeskCodeForm initial={code} />
            {findError && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-bad">{findError}</p>}
            {foundVisit && (
              <div className="space-y-3 rounded-2xl border border-green-200 bg-green-50/50 p-4">
                <div>
                  <p className="text-lg font-bold">{foundVisit.name}{foundVisit.company && <span className="font-normal text-muted"> · {foundVisit.company}</span>}</p>
                  <p className="text-sm text-muted">{[
                    foundVisit.walk_in ? `Walk-in · ${reasonLabel(foundVisit.reason)}` : "Invited",
                    foundVisit.host ? `host ${foundVisit.host}` : foundVisit.host_hint ? `wants ${foundVisit.host_hint}` : null,
                    foundVisit.expected_at && !foundVisit.walk_in ? visitTime(foundVisit.expected_at, org.timezone) : null,
                  ].filter(Boolean).join(" · ")}</p>
                  {foundVisit.purpose && <p className="text-sm text-muted">{foundVisit.purpose}</p>}
                </div>
                {foundVisit.status === "expected" || foundVisit.status === "waiting"
                  ? <AdmitControls visitId={foundVisit.id} needsHost={!foundVisit.host} hosts={hosts} />
                  : <p className="chip bg-paper text-ink">{STATUS[foundVisit.status] ?? foundVisit.status}</p>}
                {foundVisit.status === "on_site" && <form action={signOutVisitor.bind(null, foundVisit.id)}><button className="btn-ghost btn-sm">Sign out</button></form>}
              </div>
            )}
          </section>

          <section className="card space-y-2">
            <div className="flex items-center justify-between"><h2 className="font-bold">Expected today</h2><span className="text-sm text-muted">{(expected ?? []).length}</span></div>
            {(expected ?? []).length === 0 ? <p className="text-sm text-muted">No more invited visitors today.</p> :
              <ul className="divide-y divide-line">{(expected ?? []).map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <div className="min-w-0"><b>{v.visitor_name}</b>{v.visitor_company && <span className="text-muted"> · {v.visitor_company}</span>}
                    <div className="text-xs text-muted">{visitTime(v.expected_at, org.timezone)} · {nameOf.get(v.host_member_id ?? "") ?? "—"}{manyOffices ? ` · ${officeOf.get(v.location_id ?? "") ?? ""}` : ""}</div></div>
                  <div className="flex gap-1.5">
                    <form action={admitVisitor.bind(null, v.id)}><button className="btn-primary btn-sm">Admit</button></form>
                    <form action={cancelVisit.bind(null, v.id)}><button className="btn-ghost btn-sm">Cancel</button></form>
                  </div>
                </li>))}</ul>}
          </section>
        </div>

        <div className="space-y-5">
          <section className={`card space-y-2 ${(waiting ?? []).length ? "border-2 border-amber-300" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold">Waiting at reception</h2>
              {(waiting ?? []).length > 0 && <span className="chip bg-amber-100 text-warn">{(waiting ?? []).length} waiting</span>}
              <span className="ml-auto text-xs text-muted">From visitors’ phones and the tablet · updates every 15 s</span>
            </div>
            {(waiting ?? []).length === 0 ? <p className="text-sm text-muted">Nobody is waiting.</p> :
              <ul className="divide-y divide-line">{(waiting ?? []).map((v) => (
                <li key={v.id} className="space-y-2 py-3">
                  <div>
                    <p className="font-bold">{v.visitor_name}{v.visitor_company && <span className="font-normal text-muted"> · {v.visitor_company}</span>}</p>
                    <p className="text-sm">{[
                      v.walk_in ? `Walk-in · ${reasonLabel(v.reason)}` : "Invited",
                      v.host_member_id ? `host ${nameOf.get(v.host_member_id) ?? "—"}` : v.host_hint ? `wants ${v.host_hint}` : "no host chosen",
                      v.visitor_phone,
                    ].filter(Boolean).join(" · ")}</p>
                    <p className="text-xs text-muted">Code <span className="font-mono">{v.code}</span> · waiting {minsSince(v.arrived_at)} min{manyOffices ? ` · ${officeOf.get(v.location_id ?? "") ?? ""}` : ""}{v.arrival_source === "tablet" ? " · from the tablet" : ""}</p>
                  </div>
                  <AdmitControls visitId={v.id} needsHost={!v.host_member_id} hosts={hosts} hint={v.host_hint} />
                </li>))}</ul>}
          </section>

          <section className="card space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold">On site now</h2>
              <span className="chip bg-green-50 text-ok">{(onSite ?? []).length} visitor{(onSite ?? []).length === 1 ? "" : "s"}</span>
              <Link href="/visitors/on-site" className="ml-auto text-sm font-semibold underline">Print evacuation list</Link>
            </div>
            {(onSite ?? []).length === 0 ? <p className="text-sm text-muted">No visitors are signed in.</p> :
              <ul className="divide-y divide-line">{(onSite ?? []).map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <div className="min-w-0"><b>{v.visitor_name}</b>{v.visitor_company && <span className="text-muted"> · {v.visitor_company}</span>}
                    <div className="text-xs text-muted">Host {nameOf.get(v.host_member_id ?? "") ?? "—"} · in since {visitTime(v.signed_in_at, org.timezone)}{v.decided_by ? ` · admitted by ${nameOf.get(v.decided_by) ?? "reception"}` : v.sign_in_source === "tablet" ? " · tablet" : ""}</div></div>
                  <form action={signOutVisitor.bind(null, v.id)}><button className="btn-ghost btn-sm">Sign out</button></form>
                </li>))}</ul>}
          </section>
        </div>
      </div>
    </div>
  );
}

const STATUS: Record<string, string> = {
  on_site: "Already on site", left: "Visit finished", cancelled: "Cancelled", denied: "Turned away",
};

/** Admit (choosing a host when the visitor has none) or turn away. */
function AdmitControls({ visitId, needsHost, hosts, hint }: { visitId: string; needsHost: boolean; hosts: Host[]; hint?: string | null }) {
  const guess = hint ? hosts.find((h) => h.name.toLowerCase().includes(hint.trim().toLowerCase().split(" ")[0] ?? "")) : undefined;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <form action={admitVisitor.bind(null, visitId)} className="flex flex-wrap items-end gap-2">
        {needsHost && (
          <div><label className="label" htmlFor={`h-${visitId}`}>Host (optional)</label>
            <select id={`h-${visitId}`} name="host" defaultValue={guess?.id ?? ""} className="input min-w-44 py-2">
              <option value="">No host</option>{hosts.map((h) => <option key={h.id} value={h.id}>{h.name}{h.team ? ` · ${h.team}` : ""}</option>)}
            </select></div>
        )}
        <button className="btn min-h-11 bg-ok px-5 text-white hover:bg-[#136640]">Admit</button>
      </form>
      <form action={turnAwayVisitor.bind(null, visitId)}><button className="btn-ghost min-h-11 text-bad">Turn away</button></form>
    </div>
  );
}
