import Link from "next/link";
import { requireMember } from "@/lib/session";
import { CompanyMark } from "@/components/CompanyMark";
import { ModuleSwitch } from "@/components/ModuleSwitch";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { VisitorsNav } from "./VisitorsNav";
import { PlanLock } from "@/components/PlanLock";
import { visitorTier } from "@/lib/plans";

export const dynamic = "force-dynamic";

/**
 * The Visitors module: its own header, sections and permissions. Reception staff (members an admin
 * gave desk access) see the desk and invitations; managers also see the log and reports; admins
 * also manage the blocklist and settings.
 */
export default async function VisitorsLayout({ children }: { children: React.ReactNode }) {
  const { supabase, org, isAdmin, isViewer } = await requireMember({ desk: true });
  const [tier, { count: waiting }] = await Promise.all([
    visitorTier(supabase, org.id),
    supabase.from("visits").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "waiting"),
  ]);
  const items = [
    { href: "/visitors", label: "Desk" },
    { href: "/visitors/invitations", label: "Invitations" },
    ...(isViewer ? [{ href: "/visitors/log", label: "Visitor log" }, { href: "/visitors/reports", label: "Reports" }] : []),
    ...(isAdmin ? [{ href: "/visitors/blocklist", label: tier === "premium" ? "Blocklist" : "Blocklist · Premium" }, { href: "/visitors/settings", label: "Settings" }] : []),
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
      {tier !== "none" ? (
        <div className="space-y-6 pt-4">
          <VisitorsNav items={items} waiting={waiting ?? 0} />
          <main className="min-w-0">{children}</main>
        </div>
      ) : (
        <main className="pt-6">
          <PlanLock isAdmin={isAdmin} plan="Pro" title="Visitor management is part of the Pro and Premium plans" points={[
            "Invite visitors: they get the office address, a map and an “I’ve arrived” check-in link.",
            "Walk-ins scan a QR poster at reception and fill in their details on their own phone.",
            "Reception admits each visitor from one desk screen; the host gets an email.",
            "Pro: one office, up to 100 visits a month. Premium: every office, unlimited, plus the reception tablet, fire-drill roll call, blocklist and reports.",
          ]} />
        </main>
      )}
    </div>
  );
}
