import Link from "next/link";
import { requireMember } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { PlanLock } from "@/components/PlanLock";
import { saveProject } from "../actions";

export const dynamic = "force-dynamic";

/** Projects group tasks (Pro). Managers and admins create and archive them; everyone can use them. */
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, isViewer, isAdmin } = await requireMember();
  const { data: pro } = await supabase.rpc("org_has_pro", { p_org: org.id });
  if (!pro) return <PlanLock isAdmin={isAdmin} plan="Pro" title="Projects are part of Pro and Premium" points={["Group tasks by project, for example “Office move” or “Client onboarding”.", "See each project’s progress at a glance."]} />;
  const [{ data: projects }, { data: tasks }] = await Promise.all([
    supabase.from("task_projects").select("id,name,description,color,archived").eq("org_id", org.id).order("archived").order("name"),
    supabase.from("tasks").select("project_id,status").eq("org_id", org.id).not("project_id", "is", null),
  ]);
  const stats = (id: string) => { const list = (tasks ?? []).filter((t) => t.project_id === id && t.status !== "cancelled"); return { total: list.length, done: list.filter((t) => t.status === "done").length }; };
  return (
    <div className="space-y-4">
      <Flash {...readFlash(sp)} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(projects ?? []).map((p) => { const s = stats(p.id); const pct = s.total ? Math.round((s.done / s.total) * 100) : 0; return (
          <section key={p.id} className={`card space-y-3 ${p.archived ? "opacity-60" : ""}`}>
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: p.color ?? "#68737a" }} /><h2 className="font-bold">{p.name}</h2>{p.archived && <span className="chip bg-paper text-muted">Archived</span>}</div>
            {p.description && <p className="text-sm text-muted">{p.description}</p>}
            <div><div className="h-2 rounded-full bg-paper"><div className="h-2 rounded-full bg-ok" style={{ width: `${pct}%` }} /></div><p className="mt-1 text-xs text-muted">{s.done} of {s.total} tasks done</p></div>
            <div className="flex gap-2"><Link href={`/tasks?scope=${isViewer ? "team" : "mine"}&project=${p.id}&view=board`} className="btn-ghost btn-sm">Open board</Link><Link href={`/tasks/new?project=${p.id}`} className="btn-ghost btn-sm">Add task</Link></div>
            {isViewer && <details className="text-sm"><summary className="cursor-pointer text-muted underline">Edit</summary>
              <form action={saveProject.bind(null, p.id)} className="mt-2 space-y-2">
                <input name="name" required defaultValue={p.name} maxLength={80} className="input" aria-label="Project name" />
                <input name="description" defaultValue={p.description ?? ""} maxLength={500} className="input" aria-label="Description" />
                <div className="flex items-center gap-3"><input name="color" type="color" defaultValue={p.color ?? "#1e4e9c"} aria-label="Colour" className="h-10 w-12 rounded-lg border border-line" />
                  <label className="flex items-center gap-2"><input type="checkbox" name="archived" defaultChecked={p.archived} className="h-4 w-4" /> Archived</label><button className="btn-primary btn-sm ml-auto">Save</button></div>
              </form></details>}
          </section>); })}
        {isViewer && <form action={saveProject.bind(null, null)} className="card space-y-2 border-dashed">
          <h2 className="font-bold">New project</h2>
          <input name="name" required maxLength={80} className="input" placeholder="e.g. Office move" aria-label="Project name" />
          <input name="description" maxLength={500} className="input" placeholder="What it’s for (optional)" aria-label="Description" />
          <div className="flex items-center gap-3"><input name="color" type="color" defaultValue="#1e4e9c" aria-label="Colour" className="h-10 w-12 rounded-lg border border-line" /><button className="btn-primary ml-auto">Create</button></div>
        </form>}
      </div>
      {(projects ?? []).length === 0 && !isViewer && <p className="card text-sm text-muted">No projects yet. Your manager can create them.</p>}
    </div>
  );
}
