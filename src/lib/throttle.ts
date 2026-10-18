import type { SupabaseClient } from "@supabase/supabase-js";
import { friendly, isRateLimited } from "./errors.ts";

/**
 * Limits for actions the web app performs itself (exports, password changes, payment checks…).
 * The limits are defined in the database function `throttle`; this only asks it.
 * Returns null when the action may go ahead, or a message to show when it may not.
 * If the check itself fails, the action is refused (fail closed).
 */
export type Bucket =
  | "report_export" | "password_change" | "payment_verify" | "logo_upload"
  | "invite_email" | "console_export" | "console_action";

export async function throttle(supabase: SupabaseClient, bucket: Bucket): Promise<string | null> {
  const { error } = await supabase.rpc("throttle", { p_bucket: bucket });
  if (!error) return null;
  return friendly(error, `throttle/${bucket}`, "This action is unavailable right now. Please try again shortly");
}

/** HTTP status for an error from Supabase: 429 for limits, 400 for our own refusals, otherwise 500. */
export function statusFor(error: unknown): number {
  if (isRateLimited(error)) return 429;
  const code = (error as { code?: string } | null)?.code;
  if (code === "P0001" || code === "KF403" || code?.startsWith("23") || code === "22P02") return 400;
  if (code === "42501" || code === "KF401") return 403;
  return 500;
}
