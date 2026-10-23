import Link from "next/link";
import { requireMember, todayIn } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";
import { Flash } from "@/components/Flash";
import { InviteFormCard } from "./InviteFormCard";
import { readFlash } from "@/lib/flash";
import { emailEnabled } from "@/lib/email";
import { photoLinks, purgeExpiredVisitors, visitTime, zonedIso } from "@/lib/visitors";
import {
  inviteVisitor, signVisitor, cancelVisit, saveVisitorSettings, blockVisitor, unblockVisitor, addTablet, repairTablet, switchOffTablet,
} from "./actions";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "today", label: "Today" }, { id: "invite", label: "Invite a visitor" }, { id: "log", label: "Visitor log" },
  { id: "blocklist", label: "Blocklist", admin: true }, { id: "settings", label: "Settings", admin: true },
] as const;
type Tab = (typeof TABS)[number]["id"];

const STATUS: Record<string, { label: string; tone: string }> = {
  expected: { label: "Expected", tone: "bg-paper text-ink" },
  on_site: { label: "On site", tone: "bg-green-50 text-ok" },
  left: { label: "Left", tone: "bg-paper text-muted" },
  cancelled: { label: "Cancelled", tone: "bg-paper text-muted" },
  denied: { label: "Refused (blocklist)", tone: "bg-red-50 text-bad" },
};

export default async function VisitorsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, org, isAdmin, me } = await requireMember({ viewer: true });
  const flash = readFlash(sp);
  const { data: premium } = await supabase.rpc("org_has_premium", { p_org: org.id });

  if (!premium) {
    return (
      <div className="space-y-5">
        <div><p className="eyebrow">Visitors</p><h1 className="page-heading">Visitor management</h1></div>
        <section className="card space-y-3">
          <h2 className="text-lg font-bold">Part of the Premium plan</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Invite visitors; they get a QR pass by email with the office address and map.</li>
            <li>A reception tablet where visitors sign in and out, with an optional photo and printed badge.</li>
            <li>The host gets an email the moment their visitor arrives.</li>
            <li>A live list of staff and visitors on site, a blocklist, and a visitor log you can export.</li>
          </ul>
          {isAdmin ? <Link href="/admin/billing" className="btn-primary inline-flex">Upgrade to Premium</Link> : <p className="text-sm text-muted">Ask an admin to upgrade under Billing.</p>}
        </section>
      </div>
    );
  }

  const tab: Tab = TABS.some((t) => t.id === sp.tab && (!("admin" in t) || isAdmin)) ? (sp.tab as Tab) : "today";
  const admin = createAdminClient();
  if (admin) await purgeExpiredVisitors(admin);

  const [{ data: locations }, { data: people }] = await Promise.all([
    supabase.from("locations").select("id,name").eq("org_id", org.id).order("name"),
    supabase.from("members").select("id,full_name,email,team").eq("org_id", org.id).eq("status", "active").order("full_name"),
  ]);
  const offices = locations ?? [];
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email]));
  const officeOf = new Map(offices.map((l) => [l.id, l.name]));
  const today = todayIn(org.timezone);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="eyebrow">Visitors</p><h1 className="page-heading">Visitor management</h1></div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/visitors/on-site" className="btn-ghost btn-sm">Who’s on site (print)</Link>
          <Link href="/admin/visitors?tab=invite" className="btn-primary btn-sm">Invite a visitor</Link>
        </div>
      </div>
      <nav className="flex flex-wrap gap-1 border-b border-line" aria-label="Visitor sections">
        {TABS.filter((t) => !("admin" in t) || isAdmin).map((t) => (
          <Link key={t.id} href={`/admin/visitors?tab=${t.id}`} aria-current={tab === t.id ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === t.id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}>{t.label}</Link>
        ))}
      </nav>
      <Flash {...flash} />
      {!emailEnabled() && isAdmin && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-warn">Visitor emails are off: the server has no email settings yet (RESEND_API_KEY and EMAIL_FROM). Invitations still work; give visitors their code.</p>}

      {tab === "today" && <TodayTab supabase={supabase} orgId={org.id} timezone={org.timezone} today={today} nameOf={nameOf} officeOf={officeOf} />}
      {tab === "invite" && <InviteTab offices={offices} people={people ?? []} meId={me.id} today={today} />}
      {tab === "log" && <LogTab supabase={supabase} orgId={org.id} timezone={org.timezone} today={today} sp={sp} nameOf={nameOf} officeOf={officeOf} isAdmin={isAdmin} />}
      {tab === "blocklist" && isAdmin && <BlocklistTab supabase={supabase} orgId={org.id} timezone={org.timezone} />}
      {tab === "settings" && isAdmin && <SettingsTab supabase={supabase} orgId={org.id} timezone={org.timezone} offices={offices} />}
    </div>
  );
}

type Sb = Awaited<ReturnType<typeof requireMember>>["supabase"];

async function TodayTab({ supabase, orgId, timezone, today, nameOf, officeOf }: { supabase: Sb; orgId: string; timezone: string; today: string; nameOf: Map<string, string>; officeOf: Map<string, string> }) {
  const start = zonedIso(today, "00:00", timezone)!;
  const end = new Date(new Date(start).getTime() + 24 * 3600 * 1000).toISOString();
  const [{ data: onSite }, { data: expected }, { data: staffOnSite }] = await Promise.all([
    supabase.from("visits").select("id,visitor_name,visitor_company,host_member_id,location_id,signed_in_at,walk_in,code").eq("org_id", orgId).eq("status", "on_site").order("signed_in_at", { ascending: false }),
    supabase.from("visits").select("id,visitor_name,visitor_company,host_member_id,location_id,expected_at,code").eq("org_id", orgId).eq("status", "expected").gte("expected_at", start).lt("expected_at", end).order("expected_at"),
    supabase.rpc("vms_on_site", { p_location: null }),
  ]);
  const staffCount = (staffOnSite ?? []).filter((r) => r.kind === "staff").length;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card space-y-3">
        <div className="flex items-center justify-between"><h2 className="font-bold">On site now</h2><span className="chip bg-green-50 text-ok">{(onSite ?? []).length} visitor{(onSite ?? []).length === 1 ? "" : "s"} · {staffCount} staff</span></div>
        {(onSite ?? []).length === 0 ? <p className="text-sm text-muted">No visitors are signed in.</p> :
          <ul className="divide-y divide-line">{(onSite ?? []).map((v) => <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
            <div><b>{v.visitor_name}</b>{v.visitor_company ? <span className="text-muted"> · {v.visitor_company}</span> : null}{v.walk_in && <span className="chip ml-1 bg-paper text-muted">Walk-in</span>}
              <div className="text-xs text-muted">Host {nameOf.get(v.host_member_id ?? "") ?? "—"} · {officeOf.get(v.location_id ?? "") ?? ""} · since {visitTime(v.signed_in_at, timezone)}</div></div>
            <form action={signVisitor.bind(null, v.id, false)}><button className="btn-ghost btn-sm">Sign out</button></form>
          </li>)}</ul>}
      </section>
      <section className="card space-y-3">
        <div className="flex items-center justify-between"><h2 className="font-bold">Expected today</h2><span className="chip bg-paper text-ink">{(expected ?? []).length}</span></div>
        {(expected ?? []).length === 0 ? <p className="text-sm text-muted">No more visitors expected today.</p> :
          <ul className="divide-y divide-line">{(expected ?? []).map((v) => <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
            <div><b>{v.visitor_name}</b>{v.visitor_company ? <span className="text-muted"> · {v.visitor_company}</span> : null}
              <div className="text-xs text-muted">{visitTime(v.expected_at, timezone)} · host {nameOf.get(v.host_member_id ?? "") ?? "—"} · code <span className="font-mono">{v.code}</span></div></div>
            <div className="flex gap-1.5"><form action={signVisitor.bind(null, v.id, true)}><button className="btn-primary btn-sm">Sign in</button></form><form action={cancelVisit.bind(null, v.id)}><button className="btn-ghost btn-sm">Cancel</button></form></div>
          </li>)}</ul>}
      </section>
    </div>
  );
}

function InviteTab({ offices, people, meId, today }: { offices: { id: string; name: string }[]; people: { id: string; full_name: string | null; email: string; team: string | null }[]; meId: string; today: string }) {
  if (!offices.length) return <p className="card text-sm">Add an office under <Link className="underline" href="/admin/locations">Locations</Link> first.</p>;
  return <InviteFormCard action={inviteVisitor} offices={offices} people={people} meId={meId} today={today} />;
}

async function LogTab({ supabase, orgId, timezone, today, sp, nameOf, officeOf, isAdmin }: { supabase: Sb; orgId: string; timezone: string; today: string; sp: Record<string, string | undefined>; nameOf: Map<string, string>; officeOf: Map<string, string>; isAdmin: boolean }) {
  const valid = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  const to = valid(sp.to) ?? today;
  const from = valid(sp.from) ?? new Date(new Date(`${to}T00:00:00Z`).getTime() - 6 * 86400000).toISOString().slice(0, 10);
  const q = (sp.q ?? "").trim().slice(0, 60);
  let query = supabase.from("visits").select("id,visitor_name,visitor_company,visitor_email,visitor_phone,host_member_id,location_id,status,expected_at,signed_in_at,signed_out_at,walk_in,personal_data_deleted_at")
    .eq("org_id", orgId).gte("created_at", zonedIso(from, "00:00", timezone)!).lt("created_at", new Date(new Date(zonedIso(to, "00:00", timezone)!).getTime() + 86400000).toISOString())
    .order("created_at", { ascending: false }).limit(500);
  if (q) query = query.or(`visitor_name.ilike.%${q.replace(/[%,()"\\*]/g, "")}%,visitor_company.ilike.%${q.replace(/[%,()"\\*]/g, "")}%`);
  const { data: rows } = await query;
  const admin = isAdmin ? createAdminClient() : null;
  let photos = new Map<string, string>();
  if (admin && rows?.length) {
    const { data: withPhoto } = await admin.from("visits").select("id,photo_path").eq("org_id", orgId).in("id", rows.map((r) => r.id)).not("photo_path", "is", null);
    const links = await photoLinks(admin, (withPhoto ?? []).map((p) => p.photo_path!));
    photos = new Map((withPhoto ?? []).flatMap((p) => (links.get(p.photo_path!) ? [[p.id, links.get(p.photo_path!)!] as const] : [])));
  }
  const exportHref = `/admin/visitors/export?${new URLSearchParams({ from, to, ...(q ? { q } : {}) })}`;
  return (
    <div className="space-y-4">
      <form className="card flex flex-wrap items-end gap-3">
        <input type="hidden" name="tab" value="log" />
        <div><label className="label" htmlFor="l-from">From</label><input id="l-from" name="from" type="date" defaultValue={from} className="input" /></div>
        <div><label className="label" htmlFor="l-to">To</label><input id="l-to" name="to" type="date" defaultValue={to} className="input" /></div>
        <div className="min-w-48 flex-1"><label className="label" htmlFor="l-q">Name or company</label><input id="l-q" name="q" defaultValue={q} className="input" /></div>
        <button className="btn-primary">Show</button><a href={exportHref} className="btn-ghost">Download CSV</a>
      </form>
      <div className="card overflow-x-auto p-0"><table className="table min-w-[820px]">
        <thead><tr><th>Visitor</th><th>Host</th><th>Office</th><th>Status</th><th>In</th><th>Out</th></tr></thead>
        <tbody>{(rows ?? []).length === 0 ? <tr><td colSpan={6} className="text-muted">No visits in this period.</td></tr> : (rows ?? []).map((v) => <tr key={v.id}>
          <td><div className="flex items-center gap-2">{photos.get(v.id) && <img src={photos.get(v.id)} alt="" className="h-9 w-9 rounded-full object-cover" />}
            <div><b>{v.visitor_name}</b>{v.walk_in && <span className="chip ml-1 bg-paper text-muted">Walk-in</span>}<div className="text-xs text-muted">{[v.visitor_company, v.visitor_email, v.visitor_phone].filter(Boolean).join(" · ") || (v.personal_data_deleted_at ? "Details deleted (retention)" : "")}</div></div></div></td>
          <td>{nameOf.get(v.host_member_id ?? "") ?? "—"}</td><td>{officeOf.get(v.location_id ?? "") ?? "—"}</td>
          <td><span className={`chip ${STATUS[v.status]?.tone ?? ""}`}>{STATUS[v.status]?.label ?? v.status}</span></td>
          <td className="text-xs">{visitTime(v.signed_in_at ?? (v.status === "expected" ? v.expected_at : null), timezone) || "—"}</td>
          <td className="text-xs">{visitTime(v.signed_out_at, timezone) || "—"}</td>
        </tr>)}</tbody></table></div>
    </div>
  );
}

async function BlocklistTab({ supabase, orgId, timezone }: { supabase: Sb; orgId: string; timezone: string }) {
  const { data: rows } = await supabase.from("visitor_blocklist").select("id,name,email,phone,reason,created_at").eq("org_id", orgId).order("created_at", { ascending: false });
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <form action={blockVisitor} className="card space-y-3">
        <div><h2 className="font-bold">Block someone</h2><p className="text-sm text-muted">If a visitor’s name, email or phone matches, the tablet asks them to see reception and their host is told. Matching ignores capitals and spaces.</p></div>
        <div><label className="label" htmlFor="b-name">Full name</label><input id="b-name" name="name" maxLength={120} className="input" /></div>
        <div><label className="label" htmlFor="b-email">Email</label><input id="b-email" name="email" type="email" maxLength={254} className="input" /></div>
        <div><label className="label" htmlFor="b-phone">Phone</label><input id="b-phone" name="phone" type="tel" maxLength={30} className="input" /></div>
        <div><label className="label" htmlFor="b-reason">Reason (only admins see this)</label><input id="b-reason" name="reason" maxLength={300} className="input" /></div>
        <button className="btn-primary">Add to blocklist</button>
      </form>
      <section className="card space-y-2"><h2 className="font-bold">Blocklist</h2>
        {(rows ?? []).length === 0 ? <p className="text-sm text-muted">Nobody is blocked.</p> :
          <ul className="divide-y divide-line">{(rows ?? []).map((b) => <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
            <div><b>{[b.name, b.email, b.phone].filter(Boolean).join(" · ")}</b><div className="text-xs text-muted">{b.reason ?? "No reason given"} · added {visitTime(b.created_at, timezone)}</div></div>
            <form action={unblockVisitor.bind(null, b.id)}><button className="btn-ghost btn-sm">Remove</button></form>
          </li>)}</ul>}
      </section>
    </div>
  );
}

async function SettingsTab({ supabase, orgId, timezone, offices }: { supabase: Sb; orgId: string; timezone: string; offices: { id: string; name: string }[] }) {
  const [{ data: settings }, { data: tablets }] = await Promise.all([
    supabase.from("visitor_settings").select("photo_required,rules_text,retention_days,notify_host").eq("org_id", orgId).maybeSingle(),
    supabase.from("kiosk_devices").select("id,name,location_id,paired_at,last_seen_at,revoked_at,pairing_expires_at").eq("org_id", orgId).order("created_at"),
  ]);
  const s = settings ?? { photo_required: false, rules_text: "By signing in you agree to follow our safety rules, wear your visitor badge, and stay with your host.", retention_days: 90, notify_host: true };
  const officeOf = new Map(offices.map((o) => [o.id, o.name]));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form action={saveVisitorSettings} className="card space-y-4">
        <h2 className="font-bold">Visitor sign-in</h2>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="photo" defaultChecked={s.photo_required} className="mt-1" />
          <span><b>Take a photo of each visitor at the tablet</b><br /><span className="text-muted">Off by default. Photos are private: only admins see them in the visitor log, and they’re deleted with the visitor’s details.</span></span></label>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="notify" defaultChecked={s.notify_host} className="mt-1" />
          <span><b>Email the host when their visitor arrives</b></span></label>
        <div><label className="label" htmlFor="s-rules">Visitor rules (shown before sign-in; can include an NDA)</label><textarea id="s-rules" name="rules" rows={5} maxLength={2000} defaultValue={s.rules_text} className="input" /></div>
        <div><label className="label" htmlFor="s-ret">Delete visitor details after (days)</label><input id="s-ret" name="retention" type="number" min={7} max={365} defaultValue={s.retention_days} className="input max-w-32" />
          <p className="mt-1 text-xs text-muted">Names, contact details and photos are removed automatically after this; the visit count stays for reports.</p></div>
        <button className="btn-primary">Save settings</button>
      </form>
      <section className="card space-y-4">
        <div><h2 className="font-bold">Reception tablets</h2><p className="text-sm text-muted">On the tablet, open <b>{"/kiosk"}</b> on this site, then type the pairing code you get here. Each tablet belongs to one office.</p></div>
        {(tablets ?? []).length > 0 && <ul className="divide-y divide-line">{(tablets ?? []).map((t) => <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
          <div><b>{t.name}</b> · {officeOf.get(t.location_id) ?? "—"}<div className="text-xs text-muted">{t.revoked_at ? "Switched off" : t.paired_at ? `Paired · last used ${visitTime(t.last_seen_at ?? t.paired_at, timezone)}` : t.pairing_expires_at && new Date(t.pairing_expires_at) > new Date() ? "Waiting for the pairing code" : "Not paired"}</div></div>
          <div className="flex gap-1.5"><form action={repairTablet.bind(null, t.id)}><button className="btn-ghost btn-sm">{t.paired_at && !t.revoked_at ? "New code" : "Get code"}</button></form>
            {!t.revoked_at && <form action={switchOffTablet.bind(null, t.id)}><button className="btn-ghost btn-sm text-bad">Switch off</button></form>}</div>
        </li>)}</ul>}
        {offices.length ? <form action={addTablet} className="grid gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div><label className="label" htmlFor="t-name">Tablet name</label><input id="t-name" name="name" defaultValue="Reception tablet" maxLength={60} className="input" /></div>
          <div><label className="label" htmlFor="t-office">Office</label><select id="t-office" name="location" className="input">{offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
          <button className="btn-primary">Add tablet</button>
        </form> : <p className="text-sm text-muted">Add an office under Locations first.</p>}
      </section>
    </div>
  );
}
