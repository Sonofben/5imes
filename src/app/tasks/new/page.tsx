import Link from "next/link";
import { requireMember } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { TaskForm } from "../TaskForm";
import { assignablePeople } from "../people";
import { createTask } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string; project?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, me, isAdmin } = await requireMember();
  const [people, { data: projects }, { data: pro }] = await Promise.all([
    assignablePeople(supabase, org.id, me.id, isAdmin),
    supabase.from("task_projects").select("id,name").eq("org_id", org.id).eq("archived", false).order("name"),
    supabase.rpc("org_has_pro", { p_org: org.id }),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div><Link href="/tasks" className="text-sm text-muted underline">Back to tasks</Link><h1 className="page-heading mt-1">New task</h1></div>
      <Flash {...readFlash(sp)} />
      <TaskForm action={createTask} people={people} projects={projects ?? []} pro={!!pro} meId={me.id} values={{ project_id: sp.project ?? null }} submit="Create task" checklist />
    </div>
  );
}
