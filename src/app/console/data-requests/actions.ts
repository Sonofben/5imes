"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireConsoleAction } from "@/lib/console";
import { flashQuery } from "@/lib/flash";
import { friendly } from "@/lib/errors";

export async function saveDataRequest(id: string | null, f: FormData) {
  const { supabase } = await requireConsoleAction();
  const p: Record<string, string> = {};
  for (const k of ["org_id", "requester_name", "requester_email", "relationship", "kind", "received_at", "status", "details", "outcome", "due_at"]) {
    const v = f.get(k); if (typeof v === "string" && v.trim()) p[k] = v.trim().slice(0, 4000);
  }
  const { error } = await supabase.rpc("console_save_data_request", { p_id: id as string, p: p as never, p_reason: String(f.get("reason") ?? "") });
  revalidatePath("/console/data-requests");
  redirect(`/console/data-requests?${flashQuery(error ? { error: friendly(error, "console/data-requests") } : { msg: id ? "Request updated." : "Request logged. It is due in 30 days." })}`);
}
