"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveSchedule(orgId: string, memberId: string | null, formData: FormData) {
  const supabase = await createClient();
  const rows: { weekday: number; mode: string }[] = [];
  for (let weekday = 1; weekday <= 7; weekday++) {
    const mode = String(formData.get(`d${weekday}`) || "");
    if (mode) {
      if (!(mode === "office" || mode === "home" || mode === "off")) {
        revalidatePath("/admin/schedule");
        redirect("/admin/schedule?error=Choose+a+valid+mode+for+each+day");
      }
      rows.push({ weekday, mode });
    }
  }

  const { error } = await supabase.rpc("replace_schedule", { p_org: orgId, p_member: memberId, p_rows: rows });
  revalidatePath("/admin/schedule");
  redirect(`/admin/schedule?${new URLSearchParams(error ? { error: error.message } : { msg: "Schedule saved." })}`);
}
