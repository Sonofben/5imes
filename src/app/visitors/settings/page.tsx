import { redirect } from "next/navigation";
import Link from "next/link";
import { requireMember } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { visitTime, visitorLinkUrl } from "@/lib/visitors";
import {
  addTablet, createVisitorLink, repairTablet, replaceVisitorLink, saveVisitorSettings, setReceptionAccess, switchOffTablet,
} from "../actions";

export const dynamic = "force-dynamic";

const DEFAULTS = {
  photo_required: false, notify_host: true, require_admit: true, auto_admit_invited: false, office_hours_only: true,
  retention_days: 90, photo_retention_days: 30,
  rules_text: "By signing in you agree to follow our safety rules, wear your visitor badge, and stay with your host.",
  privacy_notice: "We collect your name, phone number and the details of your visit to manage access to our building and keep everyone safe. Only our reception and the person you are visiting see them. We delete them automatically after the retention period. To see or delete your details, ask at reception.",
};

export default async function VisitorSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  // Reception-only staff go back to the desk; admins must also pass two-factor (requireMember admin).
  if (!(await requireMember({ desk: true })).isAdmin) redirect("/visitors");
  const { supabase, org } = await requireMember({ admin: true });
  const flash = readFlash(sp);
  const [{ data: settings }, { data: locations }, { data: links }, { data: tablets }, { data: staff }] = await Promise.all([
    supabase.from("visitor_settings").select("photo_required,rules_text,retention_days,notify_host,require_admit,auto_admit_invited,office_hours_only,privacy_notice,photo_retention_days").eq("org_id", org.id).maybeSingle(),
    supabase.from("locations").select("id,name").eq("org_id", org.id).order("name"),
    supabase.from("visitor_links").select("location_id,token,created_at").eq("org_id", org.id).is("revoked_at", null),
    supabase.from("kiosk_devices").select("id,name,location_id,paired_at,last_seen_at,revoked_at,pairing_expires_at").eq("org_id", org.id).order("created_at"),
    supabase.from("members").select("id,full_name,email,team,role,can_reception").eq("org_id", org.id).eq("status", "active").order("full_name"),
  ]);
  const s = { ...DEFAULTS, ...(settings ?? {}) };
  const offices = locations ?? [];
  const linkOf = new Map((links ?? []).map((l) => [l.location_id, l]));
  const officeOf = new Map(offices.map((o) => [o.id, o.name]));
  const reception = (staff ?? []).filter((m) => m.role === "staff");

  return (
    <div className="space-y-5">
      <Flash {...flash} />

      <section className="card space-y-3">
        <div><h2 className="font-bold">Visitor link and QR poster</h2>
          <p className="text-sm text-muted">Each office has a private link. Print its poster for reception: walk-in visitors scan it and fill in their details on their own phone. Invited visitors don’t need it — they use the link in their invitation email.</p></div>
        {offices.length === 0 ? <p className="text-sm text-muted">Add an office under <Link className="underline" href="/admin/locations">Locations</Link> first.</p> :
          <ul className="divide-y divide-line">{offices.map((o) => {
            const l = linkOf.get(o.id);
            return <li key={o.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-48 flex-1"><b>{o.name}</b>
                {l ? <input readOnly aria-label={`Visitor link for ${o.name}`} value={visitorLinkUrl(org.slug, l.token)} className="input mt-1 font-mono text-xs" /> : <p className="text-sm text-muted">No visitor link yet.</p>}</div>
              {l ? <>
                <Link href={`/visitors/poster?office=${o.id}`} className="btn-primary btn-sm">Print poster</Link>
                <form action={replaceVisitorLink.bind(null, o.id)}><button className="btn-ghost btn-sm text-bad" title="Use if the link was shared somewhere it shouldn’t be. The old poster stops working.">Make a new link</button></form>
              </> : <form action={createVisitorLink.bind(null, o.id)}><button className="btn-primary btn-sm">Create link</button></form>}
            </li>;
          })}</ul>}
      </section>

      <form action={saveVisitorSettings} className="grid items-start gap-5 lg:grid-cols-2">
        <section className="card space-y-4">
          <h2 className="font-bold">How visitors get in</h2>
          <Check name="admit" on={s.require_admit} title="Reception must admit every visitor" note="Check-ins from phones and the tablet wait on the Desk until someone taps Admit. Recommended." />
          <Check name="autoInvited" on={s.auto_admit_invited} title="Let invited visitors in without waiting" note="A valid invitation lets them straight in; walk-ins still wait for reception." />
          <Check name="hours" on={s.office_hours_only} title="Only accept walk-in sign-ins around office hours" note="From 1 hour before work starts to 2 hours after it ends (Settings → working hours)." />
          <Check name="notify" on={s.notify_host} title="Email the host when their visitor is let in" />
          <Check name="photo" on={s.photo_required} title="Take a photo of each visitor at the tablet" note="Off by default. Only switch on if you have a clear reason; photos are private and kept for a shorter time." />
          <div><label className="label" htmlFor="s-rules">Visitor rules (shown before signing in; can include an NDA)</label>
            <textarea id="s-rules" name="rules" rows={4} maxLength={2000} defaultValue={s.rules_text} className="input" /></div>
        </section>
        <section className="card space-y-4">
          <h2 className="font-bold">Privacy (NDPA)</h2>
          <div><label className="label" htmlFor="s-notice">Privacy notice visitors must accept</label>
            <textarea id="s-notice" name="notice" rows={6} maxLength={3000} defaultValue={s.privacy_notice} className="input" />
            <p className="mt-1 text-xs text-muted">Say what you collect, why, who sees it, how long you keep it, and how to ask for it to be deleted.</p></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label" htmlFor="s-ret">Delete visitor details after (days)</label><input id="s-ret" name="retention" type="number" min={7} max={365} defaultValue={s.retention_days} className="input" /></div>
            <div><label className="label" htmlFor="s-pret">Delete photos after (days)</label><input id="s-pret" name="photoRetention" type="number" min={1} max={365} defaultValue={s.photo_retention_days} className="input" /></div>
          </div>
          <p className="text-xs text-muted">Names, contact details and photos are removed automatically; visit counts stay for reports. The audit trail is kept 2 years without names.</p>
          <button className="btn-primary">Save visitor settings</button>
        </section>
      </form>

      <section className="card space-y-3">
        <div><h2 className="font-bold">Reception desk access</h2>
          <p className="text-sm text-muted">Give the people who work at reception access to the Desk and Invitations. They don’t see attendance, reports or settings. Admins and managers already have access.</p></div>
        {reception.length === 0 ? <p className="text-sm text-muted">No staff yet.</p> :
          <ul className="divide-y divide-line">{reception.map((m) => <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
            <div><b>{m.full_name || m.email}</b>{m.team && <span className="text-muted"> · {m.team}</span>}{m.can_reception && <span className="chip ml-2 bg-[#eef2f7] text-[#1f4e79]">Reception</span>}</div>
            <form action={setReceptionAccess.bind(null, m.id, !m.can_reception)}><button className="btn-ghost btn-sm">{m.can_reception ? "Remove access" : "Give desk access"}</button></form>
          </li>)}</ul>}
      </section>

      <section className="card space-y-4">
        <div><h2 className="font-bold">Reception tablets (optional)</h2><p className="text-sm text-muted">For visitors without a smartphone. On the tablet, open <b>/kiosk</b> on this site, then type the pairing code you get here. Each tablet belongs to one office.</p></div>
        {(tablets ?? []).length > 0 && <ul className="divide-y divide-line">{(tablets ?? []).map((t) => <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
          <div><b>{t.name}</b> · {officeOf.get(t.location_id) ?? "—"}<div className="text-xs text-muted">{t.revoked_at ? "Switched off" : t.paired_at ? `Paired · last used ${visitTime(t.last_seen_at ?? t.paired_at, org.timezone)}` : t.pairing_expires_at && new Date(t.pairing_expires_at) > new Date() ? "Waiting for the pairing code" : "Not paired"}</div></div>
          <div className="flex gap-1.5"><form action={repairTablet.bind(null, t.id)}><button className="btn-ghost btn-sm">{t.paired_at && !t.revoked_at ? "New code" : "Get code"}</button></form>
            {!t.revoked_at && <form action={switchOffTablet.bind(null, t.id)}><button className="btn-ghost btn-sm text-bad">Switch off</button></form>}</div>
        </li>)}</ul>}
        {offices.length ? <form action={addTablet} className="grid gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div><label className="label" htmlFor="t-name">Tablet name</label><input id="t-name" name="name" defaultValue="Reception tablet" maxLength={60} className="input" /></div>
          <div><label className="label" htmlFor="t-office">Office</label><select id="t-office" name="location" className="input">{offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
          <button className="btn-primary">Add tablet</button>
        </form> : null}
      </section>
    </div>
  );
}

function Check({ name, on, title, note }: { name: string; on: boolean; title: string; note?: string }) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" name={name} defaultChecked={on} className="mt-1 h-4 w-4" />
      <span><b>{title}</b>{note && <><br /><span className="text-muted">{note}</span></>}</span>
    </label>
  );
}
