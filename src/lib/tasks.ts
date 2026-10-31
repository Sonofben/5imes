import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/database.types";
import { emailLayout, esc, sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site";
import { log } from "@/lib/log";
import { parseOrNull } from "@/lib/jsonShapes";

export const TASK_FILE_BUCKET = "task-files";
const FILE_TYPES: Record<string, string> = {
  "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "text/plain": "txt", "text/csv": "csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};
export const TASK_FILE_ACCEPT = Object.keys(FILE_TYPES).join(",");

/** Upload a file for a task to private storage. Returns the path; the database records it. */
export async function uploadTaskFile(admin: SupabaseClient<Database>, orgId: string, taskId: string, file: File) {
  const ext = FILE_TYPES[file.type];
  if (!ext) throw new Error("Attach a PDF, picture, Word, Excel, PowerPoint, CSV or text file.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Files must be 10 MB or smaller.");
  const { data: buckets } = await admin.storage.listBuckets();
  if (!buckets?.some((b) => b.name === TASK_FILE_BUCKET)) {
    await admin.storage.createBucket(TASK_FILE_BUCKET, { public: false, fileSizeLimit: 10 * 1024 * 1024, allowedMimeTypes: Object.keys(FILE_TYPES) });
  }
  const path = `${orgId}/${taskId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage.from(TASK_FILE_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error("We couldn't upload the file. Try again.");
  return path;
}

async function taskContext(admin: SupabaseClient<Database>, taskId: string) {
  const { data: t } = await admin.from("tasks").select("id,title,due_date,org_id,created_by").eq("id", taskId).single();
  if (!t) return null;
  const [{ data: org }, { data: people }] = await Promise.all([
    admin.from("organizations").select("name,logo_url,accent_color").eq("id", t.org_id).single(),
    admin.from("task_assignees").select("member_id,members(email,full_name,status)").eq("task_id", taskId),
  ]);
  const assignees = (people ?? []).map((p) => ({ id: p.member_id, ...(p.members as unknown as { email: string; full_name: string | null; status: string }) }))
    .filter((p) => p.status === "active");
  return { t, brand: { logoUrl: org?.logo_url, name: org?.name, accent: org?.accent_color }, assignees };
}

function button(href: string, label: string) {
  return `<p><a href="${href}" style="display:inline-block;background:#182126;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700">${esc(label)}</a></p>`;
}

/** Tell people they've been given a task (not the person who created it). */
export async function emailTaskAssigned(admin: SupabaseClient<Database> | null, taskId: string, byName: string, only?: string[]) {
  if (!admin) return;
  try {
    const c = await taskContext(admin, taskId);
    if (!c) return;
    const link = `${siteUrl()}/tasks/${taskId}`;
    const due = c.t.due_date ? ` Due ${new Intl.DateTimeFormat("en-NG", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${c.t.due_date}T00:00:00Z`))}.` : "";
    for (const p of c.assignees.filter((a) => a.id !== c.t.created_by && (!only || only.includes(a.id)))) {
      await sendEmail({ to: p.email, subject: `New task: ${c.t.title}`, html: emailLayout("You have a new task", `<p><b>${esc(byName)}</b> gave you a task: <b>${esc(c.t.title)}</b>.${esc(due)}</p>${button(link, "Open the task")}`, c.brand),
        text: `${byName} gave you a task: ${c.t.title}.${due} ${link}` });
    }
  } catch (error) { log.error("tasks.email.assigned", { message: error instanceof Error ? error.message : String(error) }); }
}

/** "Request update": email everyone on the task. */
export async function emailTaskUpdateRequest(admin: SupabaseClient<Database> | null, taskId: string, byName: string, note: string) {
  if (!admin) return;
  try {
    const c = await taskContext(admin, taskId);
    if (!c) return;
    const link = `${siteUrl()}/tasks/${taskId}`;
    for (const p of c.assignees) {
      await sendEmail({ to: p.email, subject: `Update requested: ${c.t.title}`, html: emailLayout("An update is requested", `<p><b>${esc(byName)}</b> asked for an update on <b>${esc(c.t.title)}</b>.</p>${note ? `<p>“${esc(note)}”</p>` : ""}${button(link, "Reply on the task")}`, c.brand),
        text: `${byName} asked for an update on ${c.t.title}. ${note} ${link}` });
    }
  } catch (error) { log.error("tasks.email.nudge", { message: error instanceof Error ? error.message : String(error) }); }
}

/** Something is waiting for review: email the person who created the task. */
export async function emailTaskForReview(admin: SupabaseClient<Database> | null, taskId: string, byName: string) {
  if (!admin) return;
  try {
    const c = await taskContext(admin, taskId);
    if (!c?.t.created_by) return;
    const { data: creator } = await admin.from("members").select("email,status").eq("id", c.t.created_by).single();
    if (!creator || creator.status !== "active") return;
    const link = `${siteUrl()}/tasks/${taskId}`;
    await sendEmail({ to: creator.email, subject: `Ready for review: ${c.t.title}`, html: emailLayout("A task is ready for your review", `<p><b>${esc(byName)}</b> finished <b>${esc(c.t.title)}</b>. Approve it or send it back with a note.</p>${button(link, "Review the task")}`, c.brand),
      text: `${byName} finished ${c.t.title}. Review it: ${link}` });
  } catch (error) { log.error("tasks.email.review", { message: error instanceof Error ? error.message : String(error) }); }
}

const Reminders = z.array(z.object({ task_id: z.string(), title: z.string(), due_date: z.string(), kind: z.enum(["overdue", "due_tomorrow"]), org: z.string(),
  logo_url: z.string().nullable().optional(), accent: z.string().nullable().optional(), to: z.array(z.string()) }));
let lastReminders = 0;

/** Daily from 08:00: "due tomorrow" and "overdue" emails (Pro). The database hands each out once. */
export async function runTaskReminders(admin: SupabaseClient<Database> | null) {
  if (!admin || Date.now() - lastReminders < 5 * 60 * 1000) return;
  lastReminders = Date.now();
  const { data, error } = await admin.rpc("claim_task_reminders");
  if (error) { log.error("tasks.reminders", { message: error.message }); return; }
  for (const r of parseOrNull(Reminders, data, "tasks/reminders") ?? []) {
    const link = `${siteUrl()}/tasks/${r.task_id}`;
    const title = r.kind === "overdue" ? `Overdue: ${r.title}` : `Due tomorrow: ${r.title}`;
    const body = r.kind === "overdue" ? `<p><b>${esc(r.title)}</b> was due and isn’t finished yet. Please update it or say what’s holding it up.</p>` : `<p><b>${esc(r.title)}</b> is due tomorrow.</p>`;
    for (const to of r.to.slice(0, 20)) {
      await sendEmail({ to, subject: title, html: emailLayout(title, body + button(link, "Open the task"), { logoUrl: r.logo_url, name: r.org, accent: r.accent }), text: `${title}. ${link}` });
    }
  }
}
