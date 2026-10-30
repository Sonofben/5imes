import Link from "next/link";
import { requireMember, type Subscription } from "@/lib/session";
import { CompanyMark } from "@/components/CompanyMark";
import { AdminNav } from "./AdminNav";
import { ModuleSwitch } from "@/components/ModuleSwitch";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { brandTheme } from "@/lib/brand";
import { BrandShape, parseOrNull } from "@/lib/jsonShapes";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { supabase, org, isAdmin, me } = await requireMember({ viewer: true });
  const [{ count: pendingPeople }, { count: pendingHomes }, { data: sub }, { count: pendingCorrections }, { count: pendingPlaces }, { data: brandRaw }] = await Promise.all([
    supabase.from("members").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "pending"),
    isAdmin
      ? supabase.from("member_private_locations").select("member_id", { count: "exact", head: true }).eq("org_id", org.id).not("home_req_lat", "is", null)
      : Promise.resolve({ count: 0 }),
    isAdmin ? supabase.from("subscriptions").select("*").eq("org_id", org.id).maybeSingle<Subscription>() : Promise.resolve({ data: null }),
    supabase.from("attendance_correction_requests").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "pending"),
    // RLS limits this to people the viewer line-manages (or everyone, for admins).
    supabase.from("work_location_requests").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "pending").neq("member_id", me.id),
    supabase.rpc("my_org_brand"),
  ]);
  // Pro and Premium: the header carries the company's colours (my_org_brand returns none on Basic).
  const brand = brandTheme(parseOrNull(BrandShape, brandRaw, "admin/brand"));

  let banner: React.ReactNode = null;
  if (org.suspended_at) {
    banner = <>This company&apos;s 5ime account is suspended, so check-ins are paused. Please contact 5ime support.</>;
  } else if (sub) {
    const now = Date.now();
    if (sub.status === "trialing" && sub.trial_ends_at) {
      const days = Math.ceil((new Date(sub.trial_ends_at).getTime() - now) / 86400000);
      banner = days > 0 ? <>Your Pro trial has <b>{days} day{days === 1 ? "" : "s"}</b> left.</> : <>Your trial has ended. Choose a plan to restore check-ins.</>;
    } else if (sub.current_period_end && new Date(sub.current_period_end).getTime() < now) {
      banner = <>Your paid term has ended. Pay for a new term to keep check-ins working.</>;
    } else if (sub.status === "active" && sub.current_period_end && !(sub.paystack_subscription_code && !sub.cancel_at_period_end)) {
      // Pay-per-term reminder: nothing renews automatically, so warn a week ahead.
      const days = Math.ceil((new Date(sub.current_period_end).getTime() - now) / 86400000);
      if (days <= 7) banner = <>Your paid term ends in <b>{days} day{days === 1 ? "" : "s"}</b>. Nothing is charged automatically — pay for the next term to avoid interruption.</>;
    }
  }

  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-12 sm:px-6 lg:px-8">
      {brand.branded ? (
        <header className="-mx-4 flex min-h-[72px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8" style={{ background: brand.primary, color: brand.onPrimary, borderBottom: `4px solid ${brand.accent}` }}>
          <div className="flex min-w-0 items-center gap-3">
            <CompanyMark name={org.name} logoUrl={org.logo_url} href="/admin" onBrand />
            <span className="hidden truncate border-l border-current/30 pl-3 text-sm font-semibold md:inline">{org.name}</span>
            <span className="rounded-xl bg-white p-0.5 text-ink"><ModuleSwitch current="attendance" attendanceHref="/admin" /></span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/app" className="rounded-xl border border-current/30 px-3 py-1.5 text-sm font-semibold">My check-in</Link>
            <form action="/auth/signout" method="post"><button className="rounded-xl border border-current/30 px-3 py-1.5 text-sm font-semibold">Sign out</button></form>
          </div>
        </header>
      ) : (
        <header className="flex min-h-[76px] flex-wrap items-center justify-between gap-3 border-b border-line py-4">
          <div className="flex min-w-0 items-center gap-3">
            <CompanyMark name={org.name} logoUrl={org.logo_url} href="/admin" />
            <span className="hidden truncate border-l border-line pl-3 text-sm font-medium text-muted md:inline">{org.name}</span>
            <ModuleSwitch current="attendance" attendanceHref="/admin" />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/app" className="btn-ghost btn-sm">My check-in</Link>
            <form action="/auth/signout" method="post"><button className="btn-ghost btn-sm">Sign out</button></form>
          </div>
        </header>
      )}
      <AnnouncementBanner supabase={supabase} />
      {banner && (
        <div role="status" className="my-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#ead8c0] bg-[#fff9ef] px-4 py-3 text-sm text-ink">
          <span>{banner}</span>
          <Link href="/admin/billing" className="btn-brand btn-sm">View plans</Link>
        </div>
      )}
      <div className="mt-4 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-7">
        <div className="mb-4 lg:mb-0">
          <AdminNav isAdmin={isAdmin} pendingPeople={pendingPeople ?? 0} pendingCorrections={pendingCorrections ?? 0} pendingPlaces={pendingPlaces ?? 0} />
          {isAdmin && !!pendingHomes && <Link href="/admin/staff#home-requests" className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-[#fffdf8] px-3 py-2.5 text-xs font-medium leading-5 text-warn lg:mt-3"><span>{pendingHomes} home location request{pendingHomes === 1 ? "" : "s"} awaiting review</span><span aria-hidden="true">→</span></Link>}
        </div>
        <main className="min-w-0 pt-1 lg:pt-2">{children}</main>
      </div>
    </div>
  );
}
