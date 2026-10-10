import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Flash } from "@/components/Flash";

export const dynamic = "force-dynamic";

async function saveSettings(orgId: string, formData: FormData) {
  "use server";
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
  if (errors.length) redirect(`/admin/settings?${new URLSearchParams({ error: errors.join(" ") })}`);

  const supabase = await createClient();
  const { error } = await supabase.from("organizations").update({
    name, timezone, work_start: workStart, work_end: workEnd, grace_minutes: grace, home_radius_m: homeRadius,
  }).eq("id", orgId);
  revalidatePath("/admin", "layout");
  redirect(`/admin/settings?${new URLSearchParams(error ? { error: error.message } : { msg: "Settings saved." })}`);
}

const ZONES = ["Africa/Lagos", "Africa/Accra", "Africa/Nairobi", "Africa/Johannesburg", "Africa/Cairo", "Europe/London", "UTC"];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const { org } = await requireMember({ admin: true });
  const zones = ZONES.includes(org.timezone) ? ZONES : [...ZONES, org.timezone].sort();

  return (
    <div className="max-w-2xl space-y-6">
      <div><p className="eyebrow">Organization</p><h1 className="page-heading">Company settings</h1><p className="page-description">Local work hours and location tolerances drive attendance flags and reports.</p></div>
      <Flash msg={sp.msg} error={sp.error} />
      <form action={saveSettings.bind(null, org.id)} className="card space-y-5">
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
    </div>
  );
}
