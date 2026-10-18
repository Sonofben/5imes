"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { flashQuery } from "@/lib/flash";
import { friendly } from "@/lib/errors";

function back(params: Record<string, string>): never {
  revalidatePath("/admin", "layout");
  redirect(`/admin/requests?${flashQuery(params)}`);
}

export async function decideRequest(id: string, approve: boolean, formData: FormData) {
  const { supabase } = await requireMember({ viewer: true });
  const note = String(formData.get("note") || "").trim();
  const { error } = await supabase.rpc("decide_work_elsewhere", { p_request: id, p_approve: approve, p_note: note || null });
  if (error) back({ error: friendly(error, "admin/requests") });
  back({ msg: approve ? "Approved. Their session carries on at the new place." : "Rejected. They were checked out at the time they asked to move." });
}

export async function endSessionAtDeparture(id: string) {
  const { supabase } = await requireMember({ viewer: true });
  const { error } = await supabase.rpc("end_session_at_departure", { p_departure: id });
  if (error) back({ error: friendly(error, "admin/requests") });
  back({ msg: "Session ended at the time they left." });
}
