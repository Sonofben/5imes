import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { runScheduleAutomation } from "@/lib/schedule";
import { runCelebrationEmails } from "@/lib/celebrations";

/**
 * Called every 5 minutes by the server's timer (deploy/systemd/5ime-tick.timer) so time-based work
 * happens even when nobody opens 5ime: celebration emails at 8:00, and the schedule automation as a
 * backup to pg_cron. Needs CRON_SECRET in .env; without it this route is switched off.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const ok = secret.length >= 24 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return new NextResponse("Not found", { status: 404 });
  const admin = createAdminClient();
  await runScheduleAutomation(admin);
  await runCelebrationEmails(admin);
  return NextResponse.json({ ok: true });
}
