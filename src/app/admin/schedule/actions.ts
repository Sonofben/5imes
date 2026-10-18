"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { flashQuery } from "@/lib/flash";
import { friendly } from "@/lib/errors";
import { requireMember } from "@/lib/session";

export async function saveSchedule(memberId: string | null, formData: FormData) {
  // The company always comes from the signed-in admin, never from the form.
  const { supabase, org } = await requireMember({ admin: true });
  const rows: { weekday: number; mode: string }[] = [];
  for (let weekday = 1; weekday <= 7; weekday++) {
    const mode = String(formData.get(`d${weekday}`) || "");
    if (mode) {
      if (!(mode === "office" || mode === "home" || mode === "off")) {
        revalidatePath("/admin/schedule");
        redirect(`/admin/schedule?${flashQuery({ error: "Choose a valid mode for each day" })}`);
      }
      rows.push({ weekday, mode });
    }
  }

  const { error } = await supabase.rpc("replace_schedule", { p_org: org.id, p_member: memberId, p_rows: rows });
  revalidatePath("/admin/schedule");
  redirect(`/admin/schedule?${flashQuery(error ? { error: friendly(error, "admin/schedule") } : { msg: "Schedule saved." })}`);
}
