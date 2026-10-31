import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember, todayIn } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { Avatar } from "@/components/Avatar";
import { PRIORITY, RECURRENCE, STATUS_LABEL } from "@/lib/taskLabels";
import { TASK_FILE_ACCEPT } from "@/lib/tasks";
import { TaskForm } from "../TaskForm";
import { assignablePeople } from "../people";
import { addComment, addFile, addStep, deleteTask, removeFile, removeStep, requestUpdate, reviewTask, setStatus, toggleStep, updateTask } from "../actions";

export const dynamic = "force-dynamic";

const when = (iso: string, tz: string) => new Intl.DateTimeFormat("en-NG", { timeZone: tz, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const fmtDay = (d: string) => new Intl.DateTimeFormat("en-NG", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
const ACTIONS: Record<string, string> = { created: "created the task", edited: "edited", status: "moved it to", approved: "approved it", "sent back": "sent it back",
  "update requested": "asked for an update", "file added": "added a file", "file removed": "removed a file" };

/** One task: details, status, checklist, files, comments and history. */
export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, org, me, isAdmin } = await requireMember();
  const { data: t } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
  if (!t) notFound();
  const [{ data: assignees }, { data: steps }, { data: comments }, { data: activity }, { data: files }, { data: people }, { data: projects }, { data: pro }, { data: manage }] = await Promise.all([
    supabase.from("task_assignees").select("member_id").eq("task_id", id),
    supabase.from("task_checklist").select("id,text,done").eq("task_id", id).order("position"),
    supabase.from("task_comments").select("id,member_id,kind,body,created_at").eq("task_id", id).order("created_at"),
    supabase.from("task_activity").select("id,member_id,action,detail,at").eq("task_id", id).order("at", { ascending: false }).limit(50),
    supabase.from("task_files").select("id,name,size,uploaded_by,created_at").eq("task_id", id).order("created_at"),
    supabase.from("members").select("id,full_name,email,avatar_url").eq("org_id", org.id),
    supabase.from("task_projects").select("id,name,color").eq("org_id", org.id).eq("archived", false).order("name"),
    supabase.rpc("org_has_pro", { p_org: org.id }),
    supabase.rpc("can_manage_task", { p_task: id }),
  ]);
  const who = new Map((people ?? []).map((p) => [p.id, { name: p.full_name || p.email, url: p.avatar_url }]));
  const mine = (assignees ?? []).some((a) => a.member_id === me.id);
  const today = todayIn(org.timezone);
  const overdue = t.due_date && t.due_date < today && !["done", "cancelled"].includes(t.status);
  const editable = !!manage && sp.edit === "1";
  const project = (projects ?? []).find((p) => p.id === t.project_id);
  const next: { to: string; label: string }[] = t.status === "todo" ? [{ to: "in_progress", label: "Start" }, { to: "done", label: "Mark done" }]
    : t.status === "in_progress" ? [{ to: "done", label: t.needs_review && pro ? "Done, send for review" : "Mark done" }, { to: "todo", label: "Back to To do" }]
    : t.status === "done" || t.status === "cancelled" ? [{ to: "in_progress", label: "Reopen" }] : [];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/tasks" className="text-sm text-muted underline">Back to tasks</Link>
        {manage && !editable && <Link href={`/tasks/${id}?edit=1`} className="btn-ghost btn-sm">Edit task</Link>}
      </div>
      <Flash {...readFlash(sp)} />

      {editable ? (
        <TaskForm action={updateTask.bind(null, id)} people={await assignablePeople(supabase, org.id, me.id, isAdmin).then((list) => {
          const have = new Set(list.map((p) => p.id));
          return [...list, ...(assignees ?? []).filter((a) => !have.has(a.member_id)).map((a) => ({ id: a.member_id, name: who.get(a.member_id)?.name ?? "Someone", team: null }))];
        })} projects={projects ?? []} pro={!!pro} meId={me.id} submit="Save changes"
          values={{ title: t.title, description: t.description, project_id: t.project_id, assignees: (assignees ?? []).map((a) => a.member_id), due_date: t.due_date,
            priority: t.priority, labels: t.labels, needs_review: t.needs_review, recurrence: t.recurrence }} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <section className="card space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip bg-ink text-white">{STATUS_LABEL[t.status]}</span>
                {t.priority !== "normal" && <span className={`chip ${PRIORITY[t.priority].tone}`}>{PRIORITY[t.priority].label}</span>}
                {project && <span className="chip bg-paper text-ink"><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: project.color ?? "#68737a" }} />{project.name}</span>}
                {t.recurrence && <span className="chip bg-paper text-muted">{RECURRENCE[t.recurrence]}</span>}
                {t.labels.map((l: string) => <span key={l} className="chip bg-[#eef2f7] text-[#1f4e79]">{l}</span>)}
              </div>
              <h1 className="text-2xl font-bold">{t.title}</h1>
              {t.description && <p className="whitespace-pre-line text-sm leading-6 text-ink/85">{t.description}</p>}
              {t.due_date && <p className={`text-sm ${overdue ? "font-semibold text-bad" : "text-muted"}`}>{overdue ? "Overdue: was due " : "Due "}{fmtDay(t.due_date)}</p>}

              {(mine || manage) && next.length > 0 && <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                {next.map((n) => <form key={n.to} action={setStatus.bind(null, id, n.to)}><button className={n.to === "done" ? "btn-primary" : "btn-ghost"}>{n.label}</button></form>)}
              </div>}
              {t.status === "in_review" && manage && <form className="space-y-2 border-t border-line pt-3">
                <p className="text-sm font-semibold">This task is waiting for your review.</p>
                <input name="note" maxLength={2000} className="input" placeholder="Note (needed when you send it back)" aria-label="Review note" />
                <div className="flex gap-2"><button formAction={reviewTask.bind(null, id, true)} className="btn-primary">Approve</button><button formAction={reviewTask.bind(null, id, false)} className="btn-ghost">Send back</button></div>
              </form>}
              {t.status === "in_review" && !manage && <p className="border-t border-line pt-3 text-sm text-muted">Waiting for review by the person who assigned it.</p>}
            </section>

            {pro && <section className="card space-y-3">
              <h2 className="font-bold">Checklist {steps?.length ? <span className="font-normal text-muted">· {steps.filter((s) => s.done).length}/{steps.length}</span> : null}</h2>
              {(steps ?? []).length > 0 && <ul className="space-y-1">{(steps ?? []).map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  <form action={toggleStep.bind(null, id, s.id, !s.done)}><button aria-label={s.done ? `Mark “${s.text}” not done` : `Mark “${s.text}” done`} className={`grid h-6 w-6 place-items-center rounded-md border ${s.done ? "border-ok bg-ok text-white" : "border-line bg-white"}`}>{s.done ? "✓" : ""}</button></form>
                  <span className={`flex-1 text-sm ${s.done ? "text-muted line-through" : ""}`}>{s.text}</span>
                  {manage && <form action={removeStep.bind(null, id, s.id)}><button className="text-xs text-muted underline">Remove</button></form>}
                </li>))}</ul>}
              <form action={addStep.bind(null, id)} className="flex gap-2"><label className="sr-only" htmlFor="new-step">New step</label><input id="new-step" name="text" required maxLength={200} className="input" placeholder="Add a step" /><button className="btn-ghost">Add</button></form>
            </section>}

            <section className="card space-y-3">
              <h2 className="font-bold">Comments</h2>
              {(comments ?? []).length === 0 ? <p className="text-sm text-muted">No comments yet.</p> :
                <ul className="space-y-3">{(comments ?? []).map((c) => { const p = c.member_id ? who.get(c.member_id) : null; return (
                  <li key={c.id} className={`flex gap-3 rounded-xl p-2 ${c.kind === "update_request" ? "bg-amber-50" : c.kind === "review" ? "bg-[#eef2f7]" : ""}`}>
                    <Avatar name={p?.name ?? "?"} url={p?.url} size={32} />
                    <div className="min-w-0 text-sm"><p><b>{p?.name ?? "Someone"}</b> <span className="text-xs text-muted">{when(c.created_at, org.timezone)}{c.kind === "update_request" ? " · asked for an update" : c.kind === "review" ? " · review note" : ""}</span></p>
                      <p className="whitespace-pre-line">{c.body}</p></div>
                  </li>); })}</ul>}
              <form action={addComment.bind(null, id)} className="space-y-2"><label className="sr-only" htmlFor="c-body">Comment</label><textarea id="c-body" name="body" rows={2} required maxLength={2000} className="input" placeholder="Write an update or a question" /><div className="flex justify-end"><button className="btn-primary btn-sm">Comment</button></div></form>
            </section>
          </div>

          <aside className="space-y-4">
            <section className="card space-y-3">
              <h2 className="font-bold">People</h2>
              <ul className="space-y-2">{(assignees ?? []).map((a) => { const p = who.get(a.member_id); return <li key={a.member_id} className="flex items-center gap-2 text-sm"><Avatar name={p?.name ?? "?"} url={p?.url} size={28} />{p?.name ?? "Someone"}</li>; })}</ul>
              <p className="text-xs text-muted">Assigned by {t.created_by ? who.get(t.created_by)?.name ?? "someone" : "someone"} · {when(t.created_at, org.timezone)}</p>
              {manage && pro && <form action={requestUpdate.bind(null, id)} className="space-y-2 border-t border-line pt-3">
                <label className="label" htmlFor="nudge">Ask for an update</label><input id="nudge" name="note" maxLength={500} className="input" placeholder="Optional note" />
                <button className="btn-ghost w-full">Request update</button>
              </form>}
            </section>

            {pro && <section className="card space-y-3">
              <h2 className="font-bold">Files</h2>
              {(files ?? []).length > 0 && <ul className="space-y-1 text-sm">{(files ?? []).map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2"><a className="truncate font-semibold underline" href={`/api/tasks/file?id=${f.id}`} target="_blank" rel="noreferrer">{f.name}</a>
                  {(manage || f.uploaded_by === me.id) && <form action={removeFile.bind(null, id, f.id)}><button className="text-xs text-muted underline">Remove</button></form>}</li>))}</ul>}
              <form action={addFile.bind(null, id)} className="space-y-2"><label className="sr-only" htmlFor="t-file">File</label><input id="t-file" name="file" type="file" required accept={TASK_FILE_ACCEPT} className="input py-2" /><button className="btn-ghost w-full">Upload</button></form>
              <p className="text-xs text-muted">Up to 10 MB. Only people on this task can open files.</p>
            </section>}

            <section className="card space-y-2">
              <h2 className="font-bold">History</h2>
              <ul className="space-y-1.5 text-xs text-muted">{(activity ?? []).map((a) => (
                <li key={a.id}><b className="text-ink">{a.member_id ? who.get(a.member_id)?.name ?? "Someone" : "5ime"}</b> {ACTIONS[a.action] ?? a.action}{a.action === "status" ? ` ${STATUS_LABEL[a.detail ?? ""] ?? a.detail}` : a.detail && a.action !== "edited" ? `: ${a.detail}` : ""} · {when(a.at, org.timezone)}</li>))}</ul>
            </section>

            {(isAdmin || t.created_by === me.id) && <form action={deleteTask.bind(null, id)}><button className="btn-ghost w-full text-bad">Delete task</button></form>}
          </aside>
        </div>
      )}
    </div>
  );
}
