import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Flash } from "@/components/Flash";

export const dynamic = "force-dynamic";

async function saveSettings(orgId: string, formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({
      name: String(formData.get("name")).trim(),
      timezone: String(formData.get("timezone")),
      work_start: String(formData.get("work_start")),
      work_end: String(formData.get("work_end")),
      grace_minutes: Number(formData.get("grace_minutes")),
      home_radius_m: Number(formData.get("home_radius_m")),
    })
    .eq("id", orgId);
  revalidatePath("/admin", "layout");
  redirect(`/admin/settings?${new URLSearchParams(error ? { error: error.message } : { msg: "Settings saved." } as Record<string, string>)}`);
}

const ZONES = ["Africa/Lagos", "Africa/Accra", "Africa/Nairobi", "Africa/Johannesburg", "Africa/Cairo", "Europe/London", "UTC"];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const { org } = await requireMember({ admin: true });

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Company settings</h1>
      <Flash msg={sp.msg} error={sp.error} />
      <form action={saveSettings.bind(null, org.id)} className="card space-y-4">
        <div>
          <label className="label">Company name</label>
          <input name="name" defaultValue={org.name} className="input" required />
        </div>
        <div>
          <label className="label">Email domain</label>
          <input value={`@${org.domain}`} disabled className="input bg-paper text-muted" />
          <p className="mt-1 text-xs text-muted">Only people with this email domain can join. Contact support to change it.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Work starts</label>
            <input type="time" name="work_start" defaultValue={org.work_start.slice(0, 5)} className="input" />
          </div>
          <div>
            <label className="label">Work ends</label>
            <input type="time" name="work_end" defaultValue={org.work_end.slice(0, 5)} className="input" />
          </div>
          <div>
            <label className="label">Late after (grace, minutes)</label>
            <input type="number" name="grace_minutes" min={0} max={180} defaultValue={org.grace_minutes} className="input" />
          </div>
          <div>
            <label className="label">Home radius (metres)</label>
            <input type="number" name="home_radius_m" min={50} max={1000} step={10} defaultValue={org.home_radius_m} className="input" />
          </div>
        </div>
        <div>
          <label className="label">Time zone</label>
          <select name="timezone" defaultValue={org.timezone} className="input">
            {ZONES.map((z) => <option key={z}>{z}</option>)}
          </select>
        </div>
        <button className="btn-primary">Save settings</button>
      </form>
    </div>
  );
}
