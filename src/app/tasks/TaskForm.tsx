import { RECURRENCE } from "@/lib/taskLabels";

type Person = { id: string; name: string; team: string | null };
type Values = { title?: string; description?: string | null; project_id?: string | null; assignees?: string[]; due_date?: string | null;
  priority?: string; labels?: string[]; needs_review?: boolean; recurrence?: string | null };

/** The fields of a task, for creating and editing. Pro fields are shown only when the plan has them. */
export function TaskForm({ action, people, projects, pro, meId, values = {}, submit, checklist = false }: {
  action: (f: FormData) => Promise<void>; people: Person[]; projects: { id: string; name: string }[]; pro: boolean; meId: string;
  values?: Values; submit: string; checklist?: boolean;
}) {
  const chosen = new Set(values.assignees ?? []);
  return (
    <form action={action} className="card space-y-4">
      <div><label className="label" htmlFor="t-title">Task</label><input id="t-title" name="title" required maxLength={200} defaultValue={values.title ?? ""} className="input text-base" placeholder="What needs doing?" /></div>
      <div><label className="label" htmlFor="t-desc">Details (optional)</label><textarea id="t-desc" name="description" rows={4} maxLength={5000} defaultValue={values.description ?? ""} className="input" /></div>

      <fieldset className="space-y-2">
        <legend className="label">Who is doing it</legend>
        {people.length > 1 && <p className="text-xs text-muted">Tick one or more people. Leave all unticked to keep the task for yourself.</p>}
        {people.length <= 1 ? <p className="text-sm text-muted">You. Managers and admins can give tasks to their team.</p> :
          <div className="grid max-h-56 gap-1 overflow-y-auto rounded-xl border border-line p-2 sm:grid-cols-2">{people.map((p) => (
            <label key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-paper">
              <input type="checkbox" name="assignees" value={p.id} defaultChecked={chosen.has(p.id)} className="h-4 w-4" />
              <span className="truncate">{p.id === meId ? `${p.name} (me)` : p.name}{p.team ? <span className="text-muted"> · {p.team}</span> : null}</span>
            </label>))}</div>}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="label" htmlFor="t-due">Due date</label><input id="t-due" name="due_date" type="date" defaultValue={values.due_date ?? ""} className="input" /></div>
        <div><label className="label" htmlFor="t-pri">Priority</label><select id="t-pri" name="priority" defaultValue={values.priority ?? "normal"} className="input"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
        <div><label className="label" htmlFor="t-labels">Labels (comma separated)</label><input id="t-labels" name="labels" defaultValue={(values.labels ?? []).join(", ")} className="input" placeholder="e.g. finance, client" /></div>
      </div>

      {pro ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="label" htmlFor="t-proj">Project</label><select id="t-proj" name="project_id" defaultValue={values.project_id ?? ""} className="input"><option value="">No project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div><label className="label" htmlFor="t-rec">Repeats</label><select id="t-rec" name="recurrence" defaultValue={values.recurrence ?? ""} className="input"><option value="">Does not repeat</option>{Object.entries(RECURRENCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><p className="mt-1 text-xs text-muted">Needs a due date. The next one is created when this one is done.</p></div>
          <label className="flex items-start gap-2 pt-6 text-sm"><input type="checkbox" name="needs_review" defaultChecked={values.needs_review ?? false} className="mt-0.5 h-4 w-4" /> Review before it counts as done</label>
        </div>
      ) : <p className="rounded-xl bg-paper px-3 py-2 text-xs text-muted">Projects, checklists, files, recurring tasks, reviews and reminder emails come with Pro and Premium.</p>}

      {pro && checklist && <div><label className="label" htmlFor="t-check">Checklist (one step per line, optional)</label><textarea id="t-check" name="checklist" rows={3} className="input" placeholder={"Collect the figures\nDraft the report\nSend to the client"} /></div>}
      <div className="flex justify-end"><button className="btn-primary">{submit}</button></div>
    </form>
  );
}
