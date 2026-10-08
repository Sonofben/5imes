import Link from "next/link";
import { requireMember, type Subscription } from "@/lib/session";
import { Logo } from "@/components/Logo";
import { AdminNav } from "./AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { supabase, org, isAdmin } = await requireMember({ viewer: true });

  const [{ count: pendingPeople }, { count: pendingHomes }, { data: sub }] = await Promise.all([
    supabase.from("members").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "pending"),
    supabase.from("members").select("id", { count: "exact", head: true }).eq("org_id", org.id).not("home_req_lat", "is", null),
    isAdmin
      ? supabase.from("subscriptions").select("*").eq("org_id", org.id).maybeSingle<Subscription>()
      : Promise.resolve({ data: null }),
  ]);

  let banner: React.ReactNode = null;
  if (sub) {
    const now = Date.now();
    if (sub.status === "trialing" && sub.trial_ends_at) {
      const days = Math.ceil((new Date(sub.trial_ends_at).getTime() - now) / 86400000);
      banner =
        days > 0 ? (
          <>Free trial: <b>{days} day{days === 1 ? "" : "s"}</b> left.</>
        ) : (
          <>Your free trial has ended — staff can’t check in until you subscribe.</>
        );
    } else if (sub.current_period_end && new Date(sub.current_period_end).getTime() < now) {
      banner = <>Your subscription has expired. Renew to keep check-ins working.</>;
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <header className="flex items-center justify-between py-5">
        <div className="flex items-center gap-3">
          <Logo href="/admin" />
          <span className="hidden text-sm text-muted sm:inline">· {org.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/app" className="btn-ghost btn-sm">My check-in</Link>
          <form action="/auth/signout" method="post">
            <button className="btn-ghost btn-sm">Sign out</button>
          </form>
        </div>
      </header>
      {banner && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink px-4 py-3 text-sm text-white">
          <span>{banner}</span>
          <Link href="/admin/billing" className="btn-brand btn-sm">Choose a plan</Link>
        </div>
      )}
      <AdminNav isAdmin={isAdmin} pendingCount={(pendingPeople ?? 0) + (pendingHomes ?? 0)} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
