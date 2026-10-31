import Link from "next/link";
import { requireMember, todayIn } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { Avatar } from "@/components/Avatar";
import { PRIORITY, STATUS_LABEL } from "@/lib/taskLabels";

export const dynamic = "force-dynamic";

type Row = { id: string; title: string; status: string; priority: string; due_date: string | null; labels: string[]; project_id: string | null;
  created_by: string | null; task_assignees: { member_id: string }[]; task_checklist: { done: boolean }[] };

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const fmt = (d: string) => new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

/** Tasks as a list (grouped by when they're due) or a board (by status), with filters. */
export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, org, me, isViewer } = await requireMember();
  const today = todayIn(org.timezone);
  const scope = sp.scope === "team" && isViewer ? "team" : sp.scope === "created" ? "created" : "mine";
  const view = sp.view === "board" ? "board" : "list";
  const show = sp.show === "all" ? "all" : "open";

  let q = supabase.from("tasks").select("id,title,status,priority,due_date,labels,project_id,created_by,task_assignees(member_id),task_checklist(done)")
    .eq("org_id", org.id).order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(400);
  if (scope === "created") q = q.eq("created_by", me.id);
  if (scope === "mine") {
    const { data: mine } = await supabase.from("task_assignees").select("task_id").eq("member_id", me.id).limit(2000);
    q = q.in("id", (mine ?? []).map((m) => m.task_id).concat("00000000-0000-0000-0000-000000000000"));
  }
  if (show === "open" && view === "list") q = q.in("status", ["todo", "in_progress", "in_review"]);
  if (view === "board") q = q.neq("status", "cancelled");
  if (sp.project) q = q.eq("project_id", sp.project);
  if (sp.label) q = q.contains("labels", [sp.label.toLowerCase()]);
  if (sp.q) q = q.ilike("title", `%${sp.q.replace(/[%_]/g, "")}%`);
  const [{ data: rows }, { data: people }, { data: projects }] = await Promise.all([
    q, supabase.from("members").select("id,full_name,email,avatar_url").eq("org_id", org.id),
    supabase.from("task_projects").select("id,name,color,archived").eq("org_id", org.id).order("name"),
  ]);
  const tasks = (rows ?? []) as unknown as Row[];
  const person = new Map((people ?? []).map((p) => [p.id, { name: p.full_name || p.email, url: p.avatar_url }]));
  const project = new Map((projects ?? []).map((p) => [p.id, p]));
  const keep = (k: string, v?: string) => { const u = new URLSearchParams(Object.entries({ ...sp, [k]: v }).filter(([, x]) => x) as [string, string][]); return `/tasks?${u}`; };

  const groups = view === "list" ? [
    { name: "Overdue", items: tasks.filter((t) => t.due_date && t.due_date < today && t.status !== "done") },
    { name: "Today", items: tasks.filter((t) => t.due_date === today) },
    { name: "This week", items: tasks.filter((t) => t.due_date && t.due_date > today && t.due_date <= addDays(today, 7)) },
    { name: "Later", items: tasks.filter((t) => t.due_date && t.due_date > addDays(today, 7)) },
    { name: "No due date", items: tasks.filter((t) => !t.due_date) },
    ...(show === "all" ? [{ name: "Finished", items: tasks.filter((t) => t.due_date && t.due_date < today && t.status === "done") }] : []),
  ] : [];
  const columns = view === "board" ? (["todo", "in_progress", "in_review", "done"] as const).map((s) => ({ s, items: tasks.filter((t) => t.status === s) })) : [];

  function Card({ t }: { t: Row }) {
    const steps = t.task_checklist.length, done = t.task_checklist.filter((c) => c.done).length;
    const overdue = t.due_date && t.due_date < today && t.status !== "done";
    const p = t.project_id ? project.get(t.project_id) : null;
    return (
      <Link href={`/tasks/${t.id}`} className="block rounded-2xl border border-line bg-white p-3.5 transition-colors hover:border-[#cdd3cf]">
        <div className="flex items-start justify-between gap-2">
          <p className={`font-semibold leading-5 ${t.status === "done" ? "text-muted line-through" : ""}`}>{t.title}</p>
          {t.priority !== "normal" && <span className={`chip shrink-0 ${PRIORITY[t.priority].tone}`}>{PRIORITY[t.priority].label}</span>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          {p && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: p.color ?? "#68737a" }} />{p.name}</span>}
          {t.due_date && <span className={overdue ? "font-semibold text-bad" : ""}>{overdue ? "Overdue · " : "Due "}{fmt(t.due_date)}</span>}
          {steps > 0 && <span>✓ {done}/{steps}</span>}
          {view === "list" && t.status !== "todo" && <span className="chip bg-paper text-ink">{STATUS_LABEL[t.status]}</span>}
          {t.labels.map((l) => <span key={l} className="rounded-full bg-[#eef2f7] px-2 py-0.5 text-[#1f4e79]">{l}</span>)}
          <span className="ml-auto flex -space-x-2">{t.task_assignees.slice(0, 4).map((a) => { const x = person.get(a.member_id); return x ? <Avatar key={a.member_id} name={x.name} url={x.url} size={24} /> : null; })}</span>
        </div>
      </Link>
    );
  }

  return (
    <div className="space-y-4">
      <Flash {...readFlash(sp)} />
      <form className="flex flex-wrap items-end gap-2">
        {sp.scope && <input type="hidden" name="scope" value={sp.scope} />}
        <input type="hidden" name="view" value={view} />
        <div className="min-w-48 flex-1"><label className="label" htmlFor="f-q">Search</label><input id="f-q" name="q" defaultValue={sp.q ?? ""} className="input" placeholder="Task title" /></div>
        {(projects ?? []).length > 0 && <div><label className="label" htmlFor="f-p">Project</label><select id="f-p" name="project" defaultValue={sp.project ?? ""} className="input"><option value="">All projects</option>{(projects ?? []).filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>}
        <div><label className="label" htmlFor="f-l">Label</label><input id="f-l" name="label" defaultValue={sp.label ?? ""} className="input w-32" /></div>
        {view === "list" && <div><label className="label" htmlFor="f-s">Show</label><select id="f-s" name="show" defaultValue={show} className="input"><option value="open">Open tasks</option><option value="all">Including finished</option></select></div>}
        <button className="btn-ghost">Filter</button>
        <div className="ml-auto flex rounded-xl bg-paper p-1">
          <Link href={keep("view", undefined)} aria-current={view === "list" ? "page" : undefined} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${view === "list" ? "bg-ink text-white" : "text-muted"}`}>List</Link>
          <Link href={keep("view", "board")} aria-current={view === "board" ? "page" : undefined} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${view === "board" ? "bg-ink text-white" : "text-muted"}`}>Board</Link>
        </div>
      </form>

      {tasks.length === 0 ? (
        <section className="card space-y-2 text-center">
          <p className="text-lg font-bold">{scope === "mine" ? "You have no open tasks" : "No tasks here yet"}</p>
          <p className="text-sm text-muted">Create a task, give it a due date and assign it. Everyone on it gets an email.</p>
          <div><Link href="/tasks/new" className="btn-primary inline-flex">New task</Link></div>
        </section>
      ) : view === "list" ? (
        <div className="space-y-5">{groups.filter((g) => g.items.length).map((g) => (
          <section key={g.name} className="space-y-2">
            <h2 className={`text-sm font-bold ${g.name === "Overdue" ? "text-bad" : ""}`}>{g.name} <span className="font-normal text-muted">· {g.items.length}</span></h2>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{g.items.map((t) => <Card key={t.id} t={t} />)}</div>
          </section>))}</div>
      ) : (
        <div className="grid gap-3 overflow-x-auto md:grid-cols-4">{columns.map((c) => (
          <section key={c.s} className="min-w-64 space-y-2 rounded-2xl bg-paper p-2.5">
            <h2 className="px-1 text-sm font-bold">{STATUS_LABEL[c.s]} <span className="font-normal text-muted">· {c.items.length}</span></h2>
            {c.items.slice(0, 60).map((t) => <Card key={t.id} t={t} />)}
          </section>))}</div>
      )}
    </div>
  );
}
