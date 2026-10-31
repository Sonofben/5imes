import Link from "next/link";
import { requireMember } from "@/lib/session";
import { CompanyMark } from "@/components/CompanyMark";
import { ModuleSwitch } from "@/components/ModuleSwitch";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { TasksNav } from "./TasksNav";

export const dynamic = "force-dynamic";

/** The Tasks module: everyone has their own tasks; managers see their team's; admins everyone's. */
export default async function TasksLayout({ children }: { children: React.ReactNode }) {
  const { supabase, org, isAdmin, isViewer } = await requireMember();
  const [{ data: pro }, { count: review }] = await Promise.all([
    supabase.rpc("org_has_pro", { p_org: org.id }),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "in_review"),
  ]);
  const items = [
    { href: "/tasks", label: "My tasks" },
    ...(isViewer ? [{ href: "/tasks?scope=team", label: isAdmin ? "Everyone" : "My team" }] : []),
    { href: "/tasks?scope=created", label: "I assigned" },
    ...(pro ? [{ href: "/tasks/projects", label: "Projects" }] : []),
    ...(pro && isViewer ? [{ href: "/tasks/reports", label: "Reports" }] : []),
  ];
  return (
    <div className="mx-auto max-w-[1360px] px-4 pb-12 sm:px-6 lg:px-8">
      <header className="flex min-h-[76px] flex-wrap items-center justify-between gap-3 border-b border-line py-4">
        <div className="flex min-w-0 items-center gap-3">
          <CompanyMark name={org.name} logoUrl={org.logo_url} href="/tasks" />
          <ModuleSwitch current="tasks" attendanceHref={isViewer ? "/admin" : "/app"} showVisitors={isViewer} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/tasks/new" className="btn-primary btn-sm">New task</Link>
          <form action="/auth/signout" method="post"><button className="btn-ghost btn-sm">Sign out</button></form>
        </div>
      </header>
      <AnnouncementBanner supabase={supabase} />
      <div className="space-y-5 pt-4">
        <TasksNav items={items} review={review ?? 0} />
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
