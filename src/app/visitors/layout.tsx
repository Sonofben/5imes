import Link from "next/link";
import { requireMember } from "@/lib/session";
import { CompanyMark } from "@/components/CompanyMark";
import { ModuleSwitch } from "@/components/ModuleSwitch";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { VisitorsNav } from "./VisitorsNav";

export const dynamic = "force-dynamic";

/**
 * The Visitors module: its own header, sections and permissions. Reception staff (members an admin
 * gave desk access) see the desk and invitations; managers also see the log and reports; admins
 * also manage the blocklist and settings.
 */
export default async function VisitorsLayout({ children }: { children: React.ReactNode }) {
  const { supabase, org, isAdmin, isViewer } = await requireMember({ desk: true });
  const [{ data: premium }, { count: waiting }] = await Promise.all([
    supabase.rpc("org_has_premium", { p_org: org.id }),
    supabase.from("visits").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "waiting"),
  ]);
  const items = [
    { href: "/visitors", label: "Desk" },
    { href: "/visitors/invitations", label: "Invitations" },
    ...(isViewer ? [{ href: "/visitors/log", label: "Visitor log" }, { href: "/visitors/reports", label: "Reports" }] : []),
    ...(isAdmin ? [{ href: "/visitors/blocklist", label: "Blocklist" }, { href: "/visitors/settings", label: "Settings" }] : []),
  ];

  return (
    <div className="mx-auto max-w-[1360px] px-4 pb-12 sm:px-6 lg:px-8">
      <header className="flex min-h-[76px] flex-wrap items-center justify-between gap-3 border-b border-line py-4 print:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <CompanyMark name={org.name} logoUrl={org.logo_url} href="/visitors" />
          <span className="hidden truncate border-l border-line pl-3 text-sm font-medium text-muted md:inline">{org.name}</span>
          <ModuleSwitch current="visitors" attendanceHref={isViewer ? "/admin" : "/app"} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!isViewer && <span className="chip bg-[#eef2f7] text-[#1f4e79]">Reception</span>}
          {isViewer && <Link href="/app" className="btn-ghost btn-sm">My check-in</Link>}
          <form action="/auth/signout" method="post"><button className="btn-ghost btn-sm">Sign out</button></form>
        </div>
      </header>
      <div className="print:hidden"><AnnouncementBanner supabase={supabase} /></div>
      {premium ? (
        <div className="space-y-6 pt-4">
          <VisitorsNav items={items} waiting={waiting ?? 0} />
          <main className="min-w-0">{children}</main>
        </div>
      ) : (
        <main className="pt-6">
          <section className="card max-w-2xl space-y-3">
            <p className="eyebrow">Visitors</p>
            <h1 className="text-xl font-bold">Visitor management is part of the Premium plan</h1>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              <li>Invite visitors: they get the office address, a map and an “I’ve arrived” check-in link.</li>
              <li>Walk-ins scan a QR poster at reception and fill in their details on their own phone.</li>
              <li>Reception admits each visitor from one desk screen; the host gets an email.</li>
              <li>Who’s on site for fire drills, a blocklist, reports and an audit trail for NDPA records.</li>
            </ul>
            {isAdmin ? <Link href="/admin/billing" className="btn-primary inline-flex">Upgrade to Premium</Link> : <p className="text-sm text-muted">Ask an admin to upgrade under Billing.</p>}
          </section>
        </main>
      )}
    </div>
  );
}
