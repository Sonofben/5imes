import Link from "next/link";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { requireMember } from "@/lib/session";
import { AvatarPicker } from "./AvatarPicker";
import { saveAvatar, saveBirthday } from "./actions";

export const dynamic = "force-dynamic";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** A person's picture and birthday, used for celebrations. */
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, me, org } = await requireMember();
  const [{ data: details }, { data: row }] = await Promise.all([
    supabase.from("member_private_details").select("birth_month,birth_day,celebrate_opt_out").eq("member_id", me.id).maybeSingle(),
    supabase.from("members").select("avatar_url,start_date").eq("id", me.id).single(),
  ]);
  const name = me.full_name || me.email;
  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-6 sm:px-6">
      <div><Link href="/app" className="text-sm text-muted underline">Back to check in</Link><h1 className="page-heading mt-1">My profile</h1></div>
      <Flash {...readFlash(sp)} />

      <form action={saveAvatar} className="card space-y-3">
        <AvatarPicker name={name} url={row?.avatar_url ?? null} />
        <p className="text-xs text-muted">Shown to your colleagues on celebrations. A square, clear photo of your face works best.</p>
        <div className="flex items-center justify-between gap-3">
          {row?.avatar_url ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="remove" className="h-4 w-4" /> Remove my picture</label> : <span />}
          <button className="btn-primary">Save picture</button>
        </div>
      </form>

      <form action={saveBirthday} className="card space-y-3">
        <div><h2 className="font-bold">Your birthday</h2><p className="text-sm text-muted">Day and month only, so {org.name} can celebrate you. Only you and your admins see the date.</p></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="b-month">Month</label><select id="b-month" name="month" defaultValue={details?.birth_month ?? ""} className="input"><option value="">Not set</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
          <div><label className="label" htmlFor="b-day">Day</label><select id="b-day" name="day" defaultValue={details?.birth_day ?? ""} className="input"><option value="">Not set</option>{Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></div>
        </div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="opt_out" defaultChecked={details?.celebrate_opt_out ?? false} className="mt-0.5 h-4 w-4" /> Don’t announce my birthday</label>
        <button className="btn-ghost w-full">Save</button>
      </form>

      {row?.start_date && <p className="text-center text-sm text-muted">You joined {org.name} on {new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${row.start_date}T00:00:00Z`))}.</p>}
    </main>
  );
}
