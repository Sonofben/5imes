import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { flashQuery, readFlash } from "@/lib/flash";
import { siteUrl } from "@/lib/site";
import { BrandingCard } from "./BrandingCard";
import { SupportAccessCard } from "./SupportAccessCard";
import { friendly } from "@/lib/errors";

export const dynamic = "force-dynamic";

async function saveCelebrations(formData: FormData) {
  "use server";
  const { supabase } = await requireMember({ admin: true });
  const { error } = await supabase.rpc("admin_celebration_settings", {
    p_on: formData.get("on") === "on", p_email: String(formData.get("email") ?? ""), p_hr_email: String(formData.get("hr_email") ?? ""),
    p_heads_up: Number(formData.get("heads_up") ?? 3), p_weekend: String(formData.get("weekend") ?? "friday"),
  });
  if (error) redirect(`/admin/settings?${flashQuery({ error: friendly(error, "admin/settings/celebrations") })}`);
  revalidatePath("/admin/settings");
  redirect(`/admin/settings?${flashQuery({ msg: "Celebration settings saved." })}`);
}

async function saveAutomation(formData: FormData) {
  "use server";
  const { supabase, org } = await requireMember({ admin: true });
  const until = String(formData.get("overtime_until") ?? "21:00");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(until)) redirect(`/admin/settings?${flashQuery({ error: "Choose a valid latest overtime time." })}`);
  // Pro features keep their saved values on Basic (the boxes are locked there), so upgrading later just works.
  const { data: pro } = await supabase.rpc("org_has_visitors", { p_org: org.id });
  const { error } = await supabase.from("organizations").update({
    auto_check_out: formData.get("auto_check_out") === "on",
    ...(pro ? { auto_check_in: formData.get("auto_check_in") === "on", overtime_allowed: formData.get("overtime_allowed") === "on", overtime_until: until } : {}),
  }).eq("id", org.id);
  if (error) redirect(`/admin/settings?${flashQuery({ error: friendly(error, "admin/settings/automation") })}`);
  revalidatePath("/admin/settings");
  redirect(`/admin/settings?${flashQuery({ msg: "Automation settings saved." })}`);
}

async function saveSettings(formData: FormData) {
  "use server";
  // The company always comes from the signed-in admin, never from the form.
  const { supabase, org } = await requireMember({ admin: true });
  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const workStart = String(formData.get("work_start") ?? "");
  const workEnd = String(formData.get("work_end") ?? "");
  const grace = Number(formData.get("grace_minutes"));
  const homeRadius = Number(formData.get("home_radius_m"));
  let timezoneIsValid = false;
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(); timezoneIsValid = !!timezone; } catch { timezoneIsValid = false; }
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const errors: string[] = [];
  if (!name || name.length > 100) errors.push("Company name must be 1–100 characters.");
  if (!timezoneIsValid) errors.push("Choose a valid time zone.");
  if (!timePattern.test(workStart) || !timePattern.test(workEnd)) errors.push("Enter valid 24-hour work times.");
  if (!Number.isInteger(grace) || grace < 0 || grace > 180) errors.push("Grace period must be from 0 to 180 minutes.");
  if (!Number.isInteger(homeRadius) || homeRadius < 50 || homeRadius > 1000) errors.push("Home radius must be from 50 to 1,000 metres.");
  if (errors.length) redirect(`/admin/settings?${flashQuery({ error: errors.join(" ") })}`);

  const { error } = await supabase.from("organizations").update({
    name, timezone, work_start: workStart, work_end: workEnd, grace_minutes: grace, home_radius_m: homeRadius,
  }).eq("id", org.id);
  revalidatePath("/admin", "layout");
  redirect(`/admin/settings?${flashQuery(error ? { error: friendly(error, "admin/settings") } : { msg: "Settings saved." })}`);
}

const ZONES = ["Africa/Lagos", "Africa/Accra", "Africa/Nairobi", "Africa/Johannesburg", "Africa/Cairo", "Europe/London", "UTC"];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const { org, supabase } = await requireMember({ admin: true });
  const [{ data: grants }, { data: supportLog }, { data: colorsAllowed }, { data: proFeatures }, { data: celebrate }] = await Promise.all([
    supabase.from("support_access_grants").select("expires_at").is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("expires_at", { ascending: false }).limit(1),
    supabase.rpc("my_support_log"),
    supabase.rpc("org_has_brand_colors", { p_org: org.id }),
    supabase.rpc("org_has_visitors", { p_org: org.id }),
    supabase.from("organizations").select("celebrations_on,celebrations_email,celebrations_hr_email,celebrations_heads_up_days,celebrations_weekend").eq("id", org.id).single(),
  ]);
  const zones = ZONES.includes(org.timezone) ? ZONES : [...ZONES, org.timezone].sort();

  return (
    <div className="max-w-2xl space-y-6">
      <div><p className="eyebrow">Organization</p><h1 className="page-heading">Company settings</h1><p className="page-description">Local work hours and location tolerances drive attendance flags and reports.</p></div>
      <Flash {...readFlash(sp)} />
      <form action={saveSettings} className="card space-y-5">
        <div><label className="label" htmlFor="company-name">Company name</label><input id="company-name" name="name" defaultValue={org.name} className="input" required maxLength={100} autoComplete="organization" /></div>
        <div><label className="label" htmlFor="company-domain">Email domain</label><input id="company-domain" value={`@${org.domain}`} disabled className="input bg-paper text-muted" /><p className="mt-1 text-xs text-muted">Only people using this organization’s email domain can join.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="work-start">Work starts</label><input id="work-start" type="time" name="work_start" defaultValue={org.work_start.slice(0,5)} className="input" required /></div>
          <div><label className="label" htmlFor="work-end">Work ends</label><input id="work-end" type="time" name="work_end" defaultValue={org.work_end.slice(0,5)} className="input" required /><p className="mt-1 text-xs text-muted">End before start represents an overnight shift.</p></div>
          <div><label className="label" htmlFor="grace-minutes">Late grace period</label><div className="relative"><input id="grace-minutes" type="number" name="grace_minutes" min={0} max={180} defaultValue={org.grace_minutes} className="input pr-24" required /><span className="pointer-events-none absolute right-3 top-3 text-xs text-muted">minutes</span></div></div>
          <div><label className="label" htmlFor="home-radius">Approved home radius</label><div className="relative"><input id="home-radius" type="number" name="home_radius_m" min={50} max={1000} step={10} defaultValue={org.home_radius_m} className="input pr-24" required /><span className="pointer-events-none absolute right-3 top-3 text-xs text-muted">metres</span></div></div>
        </div>
        <div><label className="label" htmlFor="timezone">Company time zone</label><select id="timezone" name="timezone" defaultValue={org.timezone} className="input">{zones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}</select><p className="mt-1 text-xs text-muted">Dates, overnight shifts, and renewal periods are handled using this organization’s time zone.</p></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><p className="max-w-sm text-xs leading-5 text-muted">Changes apply to future check-ins. Existing attendance records are not rewritten.</p><button className="btn-primary">Save settings</button></div>
      </form>
      <form action={saveAutomation} className="card space-y-4">
        <div><p className="eyebrow">Working hours</p><h2 className="mt-1 text-lg font-bold">Automatic check-in and check-out</h2>
          <p className="mt-1 text-sm text-muted">Uses the work hours above. Staff can always check in and out themselves. Holidays never count as late or absent.</p></div>
        <Toggle name="auto_check_out" on={org.auto_check_out ?? true} title="Check everyone out at closing time"
          note={`Anyone still checked in at ${org.work_end.slice(0, 5)} is checked out at ${org.work_end.slice(0, 5)}. With overtime on, people still at work can carry on.`} />
        <Toggle name="auto_check_in" on={org.auto_check_in ?? true} locked={!proFeatures} title="Check people in automatically when they arrive"
          note="After someone has checked in properly on their last 5 working days, 5ime checks them in at the time it first saw them at work, if they haven’t by start time. A problem day (wrong place, weak GPS) pauses it until they have 5 good days again. You can switch it off for one person on the Staff page." />
        <Toggle name="overtime_allowed" on={org.overtime_allowed ?? false} locked={!proFeatures} title="Allow overtime"
          note="At closing time, people still at their workplace can keep working and check out themselves. If they leave without checking out, they’re checked out at the time they were last seen there." />
        <div className="max-w-xs"><label className="label" htmlFor="overtime-until">Latest overtime time</label><input id="overtime-until" name="overtime_until" type="time" defaultValue={(org.overtime_until ?? "21:00").slice(0, 5)} disabled={!proFeatures} className="input" /><p className="mt-1 text-xs text-muted">Anyone still checked in then is checked out and the day is flagged.</p></div>
        <p className="rounded-xl bg-paper px-3 py-2 text-xs leading-5 text-muted">5ime only knows where someone is while the app is open on their phone, so automatic check-in works when they open 5ime at work. For privacy, 5ime keeps only the times, never the location, and deletes them after 90 days.</p>
        {!proFeatures && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-warn">Automatic check-in and overtime are part of Pro and Premium. <a href="/admin/billing?plan=pro" className="font-semibold underline">See plans</a></p>}
        <div className="flex justify-end border-t border-line pt-4"><button className="btn-primary">Save automation</button></div>
      </form>
      <form action={saveCelebrations} className="card space-y-4">
        <div><p className="eyebrow">People</p><h2 className="mt-1 text-lg font-bold">Birthdays and work anniversaries</h2>
          <p className="mt-1 text-sm text-muted">On the day, everyone sees a celebration in the app and can send wishes. Add start dates and birthdays under <a className="font-semibold underline" href="/admin/leave/settings">Leave types and allowances</a>; staff can add their own birthday and picture in their profile.</p></div>
        <label className="flex items-start gap-3 rounded-xl border border-line p-3"><input type="checkbox" name="on" defaultChecked={celebrate?.celebrations_on ?? true} className="mt-1 h-5 w-5" />
          <span><b className="text-sm">Celebrate birthdays and work anniversaries</b><span className="mt-0.5 block text-xs text-muted">People can still choose not to have their birthday announced.</span></span></label>
        <fieldset disabled={!proFeatures} className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="c-email">Company group email for announcements</label><input id="c-email" name="email" type="email" defaultValue={celebrate?.celebrations_email ?? ""} placeholder={`all@${org.domain}`} className="input" /><p className="mt-1 text-xs text-muted">One email at 8:00 am on the day, in your brand.</p></div>
          <div><label className="label" htmlFor="c-hr">Heads-up email for HR (optional)</label><input id="c-hr" name="hr_email" type="email" defaultValue={celebrate?.celebrations_hr_email ?? ""} placeholder="Admins, if empty" className="input" /></div>
          <div><label className="label" htmlFor="c-days">Heads-up how many days before</label><input id="c-days" name="heads_up" type="number" min={0} max={14} defaultValue={celebrate?.celebrations_heads_up_days ?? 3} className="input" /></div>
          <div><label className="label" htmlFor="c-weekend">Celebrations on a weekend</label><select id="c-weekend" name="weekend" defaultValue={celebrate?.celebrations_weekend ?? "friday"} className="input"><option value="friday">Celebrate on the Friday before</option><option value="monday">Celebrate on the Monday after</option><option value="same">Celebrate on the day</option></select></div>
        </fieldset>
        {!proFeatures && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-warn">Celebration emails are part of Pro and Premium. The in-app celebration works on every plan. <a href="/admin/billing?plan=pro" className="font-semibold underline">See plans</a></p>}
        <div className="flex justify-end border-t border-line pt-4"><button className="btn-primary">Save celebrations</button></div>
      </form>
      <BrandingCard slug={org.slug} logoUrl={org.logo_url} brandColor={org.brand_color} accentColor={org.accent_color ?? null} siteUrl={siteUrl()} colorsAllowed={!!colorsAllowed} />
      <SupportAccessCard until={grants?.[0]?.expires_at ?? null} log={(supportLog ?? [])} timezone={org.timezone} />
    </div>
  );
}

function Toggle({ name, on, title, note, locked = false }: { name: string; on: boolean; title: string; note: string; locked?: boolean }) {
  return (
    <label className={`flex items-start gap-3 rounded-xl border border-line p-3 ${locked ? "opacity-60" : ""}`}>
      <input type="checkbox" name={name} defaultChecked={on && !locked} disabled={locked} className="mt-1 h-5 w-5" />
      <span><b className="text-sm">{title}</b><span className="mt-0.5 block text-xs leading-5 text-muted">{note}</span></span>
    </label>
  );
}
