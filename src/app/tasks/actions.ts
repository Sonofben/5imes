"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";
import { flashQuery } from "@/lib/flash";
import { friendly } from "@/lib/errors";
import { uuid } from "@/lib/schemas";
import { emailTaskAssigned, emailTaskForReview, emailTaskUpdateRequest, TASK_FILE_BUCKET, uploadTaskFile } from "@/lib/tasks";

function go(path: string, q: Record<string, string>): never {
  revalidatePath("/tasks", "layout");
  redirect(`${path}?${flashQuery(q)}`);
}
const one = (id: string) => uuid.safeParse(id).success;
const lines = (v: FormDataEntryValue | null) => String(v ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
const labels = (v: FormDataEntryValue | null) => String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function fields(f: FormData) {
  return {
    title: String(f.get("title") ?? "").trim(),
    description: String(f.get("description") ?? ""),
    project_id: String(f.get("project_id") ?? ""),
    assignees: f.getAll("assignees").map(String).filter(one),
    due_date: String(f.get("due_date") ?? ""),
    priority: String(f.get("priority") ?? "normal"),
    labels: labels(f.get("labels")),
    needs_review: f.get("needs_review") === "on",
    recurrence: String(f.get("recurrence") ?? ""),
  };
}

export async function createTask(f: FormData) {
  const { supabase, me } = await requireMember();
  const p = { ...fields(f), checklist: lines(f.get("checklist")) };
  if (!p.title) go("/tasks/new", { error: "Give the task a title." });
  const { data: id, error } = await supabase.rpc("create_task", { p });
  if (error) go("/tasks/new", { error: friendly(error, "tasks/create") });
  await emailTaskAssigned(createAdminClient(), id as string, me.full_name || me.email);
  go(`/tasks/${id}`, { msg: "Task created." });
}

export async function updateTask(id: string, f: FormData) {
  const { supabase, me } = await requireMember();
  if (!one(id)) go("/tasks", { error: "Unknown task." });
  const p = fields(f);
  const { data: before } = await supabase.from("task_assignees").select("member_id").eq("task_id", id);
  const { error } = await supabase.rpc("update_task", { p_id: id, p });
  if (error) go(`/tasks/${id}`, { error: friendly(error, "tasks/update") });
  const added = p.assignees.filter((a) => !(before ?? []).some((b) => b.member_id === a));
  if (added.length) await emailTaskAssigned(createAdminClient(), id, me.full_name || me.email, added);
  go(`/tasks/${id}`, { msg: "Saved." });
}

export async function setStatus(id: string, status: string) {
  const { supabase, me } = await requireMember();
  if (!one(id)) go("/tasks", { error: "Unknown task." });
  const { data: result, error } = await supabase.rpc("set_task_status", { p_id: id, p_status: status });
  if (error) go(`/tasks/${id}`, { error: friendly(error, "tasks/status") });
  if (result === "in_review") await emailTaskForReview(createAdminClient(), id, me.full_name || me.email);
  go(`/tasks/${id}`, { msg: result === "in_review" ? "Sent for review." : "Updated." });
}

export async function reviewTask(id: string, approve: boolean, f: FormData) {
  const { supabase } = await requireMember();
  const { error } = await supabase.rpc("review_task", { p_id: id, p_approve: approve, p_note: String(f.get("note") ?? "") });
  if (error) go(`/tasks/${id}`, { error: friendly(error, "tasks/review") });
  go(`/tasks/${id}`, { msg: approve ? "Approved. Well done to the team." : "Sent back with your note." });
}

export async function addComment(id: string, f: FormData) {
  const { supabase } = await requireMember();
  const body = String(f.get("body") ?? "").trim();
  if (!body) go(`/tasks/${id}`, { error: "Write a comment first." });
  const { error } = await supabase.rpc("add_task_comment", { p_id: id, p_body: body });
  if (error) go(`/tasks/${id}`, { error: friendly(error, "tasks/comment") });
  go(`/tasks/${id}`, { msg: "Comment added." });
}

export async function requestUpdate(id: string, f: FormData) {
  const { supabase, me } = await requireMember();
  const note = String(f.get("note") ?? "").trim();
  const { error } = await supabase.rpc("request_task_update", { p_id: id, p_note: note });
  if (error) go(`/tasks/${id}`, { error: friendly(error, "tasks/nudge") });
  await emailTaskUpdateRequest(createAdminClient(), id, me.full_name || me.email, note);
  go(`/tasks/${id}`, { msg: "Update requested. Everyone on the task has been emailed." });
}

export async function addStep(id: string, f: FormData) {
  const { supabase } = await requireMember();
  const { error } = await supabase.rpc("add_check_item", { p_id: id, p_text: String(f.get("text") ?? "") });
  if (error) go(`/tasks/${id}`, { error: friendly(error, "tasks/step") });
  go(`/tasks/${id}`, {});
}

export async function toggleStep(id: string, item: string, done: boolean) {
  const { supabase } = await requireMember();
  const { error } = await supabase.rpc("toggle_check_item", { p_item: item, p_done: done });
  if (error) go(`/tasks/${id}`, { error: friendly(error, "tasks/step") });
  go(`/tasks/${id}`, {});
}

export async function removeStep(id: string, item: string) {
  const { supabase } = await requireMember();
  const { error } = await supabase.rpc("remove_check_item", { p_item: item });
  if (error) go(`/tasks/${id}`, { error: friendly(error, "tasks/step") });
  go(`/tasks/${id}`, {});
}

export async function addFile(id: string, f: FormData) {
  const { supabase, org } = await requireMember();
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) go(`/tasks/${id}`, { error: "Choose a file." });
  const admin = createAdminClient();
  if (!admin) go(`/tasks/${id}`, { error: "Files can't be uploaded right now." });
  const { data: visible } = await supabase.rpc("can_see_task", { p_task: id });
  if (!visible) go("/tasks", { error: "That task was not found." });
  let path: string;
  try { path = await uploadTaskFile(admin, org.id, id, file); } catch (e) { go(`/tasks/${id}`, { error: e instanceof Error ? e.message : "Upload failed." }); }
  const { error } = await supabase.rpc("attach_task_file", { p_id: id, p_path: path, p_name: file.name.slice(0, 160), p_size: file.size });
  if (error) { await admin.storage.from(TASK_FILE_BUCKET).remove([path]); go(`/tasks/${id}`, { error: friendly(error, "tasks/file") }); }
  go(`/tasks/${id}`, { msg: "File added." });
}

export async function removeFile(id: string, file: string) {
  const { supabase } = await requireMember();
  const { data: path, error } = await supabase.rpc("remove_task_file", { p_file: file });
  if (error) go(`/tasks/${id}`, { error: friendly(error, "tasks/file") });
  const admin = createAdminClient();
  if (admin && path) await admin.storage.from(TASK_FILE_BUCKET).remove([path as string]);
  go(`/tasks/${id}`, { msg: "File removed." });
}

export async function deleteTask(id: string) {
  const { supabase } = await requireMember();
  const { data: files } = await supabase.from("task_files").select("path").eq("task_id", id);
  const { error } = await supabase.rpc("delete_task", { p_id: id });
  if (error) go(`/tasks/${id}`, { error: friendly(error, "tasks/delete") });
  const admin = createAdminClient();
  if (admin && files?.length) await admin.storage.from(TASK_FILE_BUCKET).remove(files.map((x) => x.path));
  go("/tasks", { msg: "Task deleted." });
}

export async function saveProject(id: string | null, f: FormData) {
  const { supabase } = await requireMember({ viewer: true });
  const color = String(f.get("color") ?? "");
  const { error } = await supabase.rpc("save_task_project", {
    p_id: id, p_name: String(f.get("name") ?? ""), p_description: String(f.get("description") ?? ""),
    p_color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : null, p_archived: f.get("archived") === "on",
  });
  if (error) go("/tasks/projects", { error: friendly(error, "tasks/project") });
  go("/tasks/projects", { msg: id ? "Project saved." : "Project created." });
}
