"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { flashQuery } from "@/lib/flash";
import { friendly } from "@/lib/errors";
import { uuid } from "@/lib/schemas";

function back(q: Record<string, string>): never {
  revalidatePath("/admin/holidays");
  redirect(`/admin/holidays?${flashQuery(q)}`);
}

export async function addHoliday(f: FormData) {
  const { supabase } = await requireMember({ admin: true });
  const day = String(f.get("day") ?? "");
  const name = String(f.get("name") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) back({ error: "Choose a date." });
  const { error } = await supabase.rpc("admin_add_holiday", { p_day: day, p_name: name });
  if (error) back({ error: friendly(error, "admin/holidays") });
  back({ msg: `${name} added. Nobody is marked late or absent that day.` });
}

export async function removeHoliday(id: string) {
  const { supabase } = await requireMember({ admin: true });
  if (!uuid.safeParse(id).success) back({ error: "Unknown holiday." });
  const { error } = await supabase.rpc("admin_remove_holiday", { p_id: id });
  if (error) back({ error: friendly(error, "admin/holidays") });
  back({ msg: "Holiday removed." });
}
