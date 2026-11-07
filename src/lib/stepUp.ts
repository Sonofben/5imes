import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";
import { safeNextPath } from "./safeNext.ts";

/**
 * Step-up: a fresh two-step code before sensitive actions (exports, deleting staff or a company,
 * billing changes, turning off or resetting two-step sign-in).
 *
 * The code is checked by Supabase Auth on the server (/api/security/step-up) and recorded in
 * public.step_up_verifications for the current session. It counts for STEP_UP_MINUTES. The same
 * rule is applied in the database (public.step_up_fresh / require_step_up, migration 0034).
 */
export const STEP_UP_MINUTES = 5;

/** The code screen, coming back to `next` (a path on this site) afterwards. */
export function stepUpUrl(next: string) {
  return `/auth/verify?next=${encodeURIComponent(safeNextPath(next, "/admin"))}`;
}

/** The database's "enter a fresh code" refusal (SQLSTATE KF412). */
export function isStepUpError(error: unknown) {
  return (error as { code?: string } | null)?.code === "KF412";
}

/** Has this session typed a fresh code within the last STEP_UP_MINUTES? Fails closed. */
export async function hasFreshStepUp(supabase: SupabaseClient<Database>) {
  const { data, error } = await supabase.rpc("step_up_fresh");
  return !error && data === true;
}

/** The redirect for server actions lives in session.ts as requireStepUp (this file has no Next imports, so it can be unit-tested). */
