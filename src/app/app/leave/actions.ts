"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";
import { flashQuery } from "@/lib/flash";
import { friendly } from "@/lib/errors";
import { uuid } from "@/lib/schemas";
import { emailLeaveRequested, LEAVE_DOC_BUCKET, uploadLeaveDoc } from "@/lib/leave";

function back(q: Record<string, string>): never {
  revalidatePath("/app/leave");
  redirect(`/app/leave?${flashQuery(q)}`);
}
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function requestLeave(f: FormData) {
  const { supabase, me, org } = await requireMember();
  const type = String(f.get("type") ?? ""), start = String(f.get("start") ?? ""), end = String(f.get("end") ?? "") || start;
  if (!uuid.safeParse(type).success) back({ error: "Choose a leave type." });
  if (!DATE.test(start) || !DATE.test(end)) back({ error: "Choose the dates." });
  const reason = String(f.get("reason") ?? "").slice(0, 500);
  const file = f.get("document");
  const admin = createAdminClient();
  let path: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (!admin) back({ error: "Documents can't be uploaded right now. Try again later." });
    try { path = await uploadLeaveDoc(admin, org.id, me.id, file); } catch (e) { back({ error: e instanceof Error ? e.message : "Upload failed." }); }
  }
  const { data: id, error } = await supabase.rpc("request_leave", { p_type: type, p_start: start, p_end: end, p_reason: reason, p_document: path });
  if (error) {
    if (path && admin) await admin.storage.from(LEAVE_DOC_BUCKET).remove([path]);
    back({ error: friendly(error, "app/leave") });
  }
  await emailLeaveRequested(admin, id as string);
  back({ msg: "Your request has been sent. You’ll get an email when it’s decided." });
}

export async function cancelLeave(id: string) {
  const { supabase } = await requireMember();
  if (!uuid.safeParse(id).success) back({ error: "Unknown request." });
  const { error } = await supabase.rpc("cancel_leave", { p_id: id });
  if (error) back({ error: friendly(error, "app/leave/cancel") });
  back({ msg: "Leave cancelled." });
}

export async function saveBirthday(f: FormData) {
  const { supabase } = await requireMember();
  const month = Number(f.get("month") || 0), day = Number(f.get("day") || 0);
  const has = month > 0 && day > 0;
  const { error } = await supabase.rpc("set_my_birthday", { p_month: has ? month : null, p_day: has ? day : null, p_opt_out: f.get("opt_out") === "on" });
  if (error) back({ error: friendly(error, "app/birthday") });
  back({ msg: "Saved." });
}
