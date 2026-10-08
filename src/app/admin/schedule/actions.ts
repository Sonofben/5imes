"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveSchedule(orgId: string, memberId: string | null, formData: FormData) {
  const supabase = await createClient();
  const rows: { org_id: string; member_id: string | null; weekday: number; mode: string }[] = [];
  for (let d = 1; d <= 7; d++) {
    const mode = String(formData.get(`d${d}`) || "");
    if (mode) rows.push({ org_id: orgId, member_id: memberId, weekday: d, mode });
  }

  const del = supabase.from("schedules").delete().eq("org_id", orgId);
  const { error: delError } = await (memberId ? del.eq("member_id", memberId) : del.is("member_id", null));
  let error = delError;
  if (!error && rows.length) ({ error } = await supabase.from("schedules").insert(rows));

  revalidatePath("/admin/schedule");
  redirect(`/admin/schedule?${new URLSearchParams(error ? { error: error.message } : { msg: "Schedule saved." } as Record<string, string>)}`);
}
