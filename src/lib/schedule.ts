import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { log } from "@/lib/log";

let lastRun = 0;
/**
 * Backup for the database's own 5-minute timer (pg_cron): apply automatic check-in and closing-time
 * check-out. Runs at most every 3 minutes, triggered by app pages, and is safe to run any time.
 */
export async function runScheduleAutomation(admin: SupabaseClient<Database> | null) {
  if (!admin || Date.now() - lastRun < 3 * 60 * 1000) return;
  lastRun = Date.now();
  const { error } = await admin.rpc("run_schedule_automation");
  if (error) log.error("schedule.automation", { message: error.message });
  const { error: visitError } = await admin.rpc("close_forgotten_visits");
  if (visitError) log.error("field.close_forgotten", { message: visitError.message });
}
