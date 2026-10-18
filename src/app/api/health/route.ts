import { NextResponse } from "next/server";
import { log } from "@/lib/log";

/**
 * GET /api/health — used by deploy.sh after a release and by uptime monitors.
 * 200 when the app is running and the database answers; 503 otherwise.
 * The result is cached for 10 seconds so frequent checks don't become database load.
 */
export const dynamic = "force-dynamic";

let cached: { at: number; body: { ok: boolean; db: boolean; version: string }; status: number } | null = null;

export async function GET() {
  if (cached && Date.now() - cached.at < 10_000) return NextResponse.json(cached.body, { status: cached.status, headers: { "Cache-Control": "no-store" } });
  const version = process.env.APP_VERSION || "dev";
  let db = false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    try {
      const res = await fetch(`${url}/rest/v1/rpc/public_plans`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(4000),
        cache: "no-store",
      });
      db = res.ok;
      if (!db) log.warn("health.db", { status: res.status });
    } catch (error) {
      log.warn("health.db", { message: error instanceof Error ? error.message : String(error) });
    }
  }
  const body = { ok: db, db, version };
  cached = { at: Date.now(), body, status: db ? 200 : 503 };
  return NextResponse.json(body, { status: cached.status, headers: { "Cache-Control": "no-store" } });
}
