"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/session";

export async function reviewAttendanceCorrection(requestId: string, formData: FormData) {
  const { supabase } = await requireMember({ viewer: true });
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (decision !== "approve" && decision !== "reject") {
    redirect("/admin/attendance-corrections?error=Choose+approve+or+reject.");
  }
  if (note.length > 500) redirect("/admin/attendance-corrections?error=Review+notes+must+be+500+characters+or+fewer.");
  const { error } = await supabase.rpc("review_attendance_correction", {
    p_request_id: requestId,
    p_approve: decision === "approve",
    p_note: note || null,
  });
  if (error) redirect(`/admin/attendance-corrections?${new URLSearchParams({ error: error.message })}`);
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/attendance-corrections");
  revalidatePath("/admin/reports");
  revalidatePath("/app");
  redirect(`/admin/attendance-corrections?${new URLSearchParams({ msg: decision === "approve" ? "Correction approved; attendance was updated and audited." : "Correction rejected; the original attendance was left unchanged." })}`);
}
