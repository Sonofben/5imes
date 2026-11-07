import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";
import { log } from "./log.ts";

/**
 * Visitor clean-up: delete visitor details and photos past each company's own retention settings,
 * sign out visitors still on site after 16 hours, cancel arrivals nobody answered in 12 hours, and
 * drop visitor audit entries older than 2 years (database: vms_purge_expired, migration 0016).
 *
 * Runs every 5 minutes from the server timer (/api/cron/tick) and when /visitors is opened.
 *
 * Dry run (VISITOR_CLEANUP_DRY_RUN=1, the default on staging): counts what WOULD be done for each
 * company (vms_purge_preview, 0035), logs the counts and changes nothing. Live: runs the clean-up and
 * records how much was done for each company (the preview before minus the preview after).
 * Only counts and company ids are logged — never names, emails or phone numbers.
 */

const PHOTO_BUCKET = "visitor-photos"; // same bucket as lib/visitors.ts

export type CleanupCounts = { org_id: string; details: number; photos: number; sign_outs: number; waiting: number; audit: number };
type PreviewRow = { org_id: string; details_due: number; photos_due: number; sign_out_due: number; waiting_due: number; audit_due: number };

/** VISITOR_CLEANUP_DRY_RUN=1/true/yes/on → dry run; 0/false/no/off → live; not set → dry run on staging only. */
export function visitorCleanupDryRun(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.VISITOR_CLEANUP_DRY_RUN ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return env.APP_ENV === "staging";
}

const fromPreview = (r: PreviewRow): CleanupCounts => ({
  org_id: r.org_id, details: r.details_due, photos: r.photos_due, sign_outs: r.sign_out_due, waiting: r.waiting_due, audit: r.audit_due,
});

/** What a live run did for each company: due before minus still due after (companies with nothing done are left out). */
export function cleanupDone(before: PreviewRow[], after: PreviewRow[]): CleanupCounts[] {
  const left = new Map(after.map((r) => [r.org_id, r]));
  return before.map((b) => {
    const a = left.get(b.org_id);
    const less = (x: number, y: number | undefined) => Math.max(0, x - (y ?? 0));
    return {
      org_id: b.org_id,
      details: less(b.details_due, a?.details_due), photos: less(b.photos_due, a?.photos_due),
      sign_outs: less(b.sign_out_due, a?.sign_out_due), waiting: less(b.waiting_due, a?.waiting_due), audit: less(b.audit_due, a?.audit_due),
    };
  }).filter((c) => c.details + c.photos + c.sign_outs + c.waiting + c.audit > 0);
}

/** One line for Global Admin → Operations (job_runs.detail, at most 1000 characters). */
export function cleanupSummary(dryRun: boolean, companies: CleanupCounts[]): string {
  const head = `${dryRun ? "Dry run, nothing changed" : "Done"}: ${companies.length} compan${companies.length === 1 ? "y" : "ies"}`;
  const parts = companies.map((c) => `${c.org_id} details ${c.details}, photos ${c.photos}, signed out ${c.sign_outs}, cancelled ${c.waiting}, audit ${c.audit}`);
  const text = parts.length ? `${head}. ${parts.join("; ")}` : head;
  return text.length > 1000 ? `${text.slice(0, 997)}...` : text;
}

/** Run (or, in a dry run, only count) the clean-up. Throws on a database error so the job is recorded as failed. */
export async function runVisitorCleanup(admin: SupabaseClient<Database>, dryRun: boolean) {
  const { data: before, error } = await admin.rpc("vms_purge_preview");
  if (error) throw new Error(`visitor clean-up preview: ${error.message}`);
  const due: PreviewRow[] = before ?? [];

  if (dryRun) {
    const companies = due.map(fromPreview);
    for (const c of companies) log.info("visitors.cleanup.dry_run", { ...c });
    return { dryRun, companies, summary: cleanupSummary(true, companies) };
  }
  if (!due.length) return { dryRun, companies: [] as CleanupCounts[], summary: cleanupSummary(false, []) };

  const { data, error: purgeError } = await admin.rpc("vms_purge_expired", { p_limit: 500 });
  if (purgeError) throw new Error(`visitor clean-up: ${purgeError.message}`);
  const paths = (data ?? []).map((r) => r.photo_path).filter((p): p is string => !!p);
  if (paths.length) {
    const { error: rmError } = await admin.storage.from(PHOTO_BUCKET).remove(paths);
    if (rmError) log.error("visitors.cleanup.photos", { message: rmError.message, count: paths.length });
  }
  const { data: after } = await admin.rpc("vms_purge_preview");
  const companies = cleanupDone(due, after ?? []);
  for (const c of companies) log.info("visitors.cleanup", { ...c });
  return { dryRun, companies, summary: cleanupSummary(false, companies) };
}
