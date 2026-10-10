"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/session";

function fail(message: string): never {
  redirect(`/app/corrections?${new URLSearchParams({ error: message })}`);
}

export async function submitAttendanceCorrection(formData: FormData) {
  const { supabase } = await requireMember();
  const workDate = String(formData.get("work_date") ?? "");
  const checkIn = String(formData.get("check_in") ?? "");
  const checkOut = String(formData.get("check_out") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(workDate)
    && new Date(`${workDate}T00:00:00.000Z`).toISOString().slice(0, 10) === workDate;
  const validTime = (value: string) => !value || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (!validDate) fail("Choose a valid work date.");
  if (!validTime(checkIn) || !validTime(checkOut)) fail("Enter valid 24-hour check-in or check-out times.");
  if (!checkIn && !checkOut) fail("Enter at least one corrected time.");
  if (reason.length < 10 || reason.length > 1000) fail("Explain the correction in 10 to 1,000 characters.");

  const { error } = await supabase.rpc("request_attendance_correction", {
    p_work_date: workDate,
    p_check_in: checkIn || null,
    p_check_out: checkOut || null,
    p_reason: reason,
  });
  if (error) fail(error.message);
  revalidatePath("/app");
  revalidatePath("/app/corrections");
  revalidatePath("/admin", "layout");
  redirect("/app/corrections?msg=Your+correction+request+was+sent+for+manager+review.");
}
