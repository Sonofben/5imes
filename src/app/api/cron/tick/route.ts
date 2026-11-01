import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { runScheduleAutomation } from "@/lib/schedule";
import { runCelebrationEmails } from "@/lib/celebrations";
import { runTaskReminders } from "@/lib/tasks";
import { syncRenewalPrices } from "@/lib/paystack";

/**
 * Called every 5 minutes by the server's timer (deploy/systemd/5ime-tick.timer) so time-based work
 * happens even when nobody opens 5ime: celebration and task reminder emails at 8:00, and the schedule automation as a
 * backup to pg_cron. Needs CRON_SECRET in .env; without it this route is switched off.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const ok = secret.length >= 24 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return new NextResponse("Not found", { status: 404 });
  const admin = createAdminClient();
  // Each job is recorded for Global Admin → Operations; one failing job never stops the others.
  const run = async (job: string, fn: () => Promise<unknown>) => {
    const started = new Date().toISOString();
    let ok = true, detail: string | null = null;
    try { await fn(); } catch (error) { ok = false; detail = (error instanceof Error ? error.message : String(error)).slice(0, 1000); }
    if (admin) await admin.from("job_runs").insert({ job, started_at: started, finished_at: new Date().toISOString(), ok, detail });
  };
  await run("schedule_automation", () => runScheduleAutomation(admin));
  await run("celebration_emails", () => runCelebrationEmails(admin));
  await run("task_reminders", () => runTaskReminders(admin));
  if (admin) {
    await run("cleanup", async () => {
      const a = await admin.rpc("purge_old_sales_enquiries"); if (a.error) throw new Error(a.error.message);
      const b = await admin.rpc("purge_operations_logs"); if (b.error) throw new Error(b.error.message);
    });
    await run("renewal_price_sync", () => syncRenewalPrices(admin));
  }
  return NextResponse.json({ ok: true });
}
