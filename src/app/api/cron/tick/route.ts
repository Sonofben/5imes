import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { runScheduleAutomation } from "@/lib/schedule";
import { runCelebrationEmails } from "@/lib/celebrations";
import { runTaskReminders } from "@/lib/tasks";
import { syncRenewalPrices } from "@/lib/paystack";
import { submitToIndexNow, indexNowKey } from "@/lib/indexnow";
import sitemap from "@/app/sitemap";

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
    // Once a day, tell search engines about every public page (new blog posts get crawled quickly).
    if (indexNowKey()) {
      const { data: last } = await admin.from("job_runs").select("started_at").eq("job", "indexnow").eq("ok", true).order("started_at", { ascending: false }).limit(1).maybeSingle();
      if (!last || Date.now() - new Date(last.started_at).getTime() > 23 * 3600_000) {
        await run("indexnow", async () => { await submitToIndexNow((await sitemap()).map((e) => e.url)); });
      }
    }
  }
  return NextResponse.json({ ok: true });
}
