import { logError } from "./log.ts";

/**
 * Turn any error into a message that is safe to show a customer.
 *
 * - Our own refusals (raised in the database with `raise exception '...'`, SQLSTATE P0001,
 *   and our KF4xx codes) are already written for users, so they are shown as they are.
 * - A few common database codes get a plain sentence.
 * - Anything else is unexpected: it is logged with a reference, and the user sees a
 *   general message with that reference so support can find the full error.
 *
 * Throw `UserError` from app code when the message is meant for the user.
 */
export class UserError extends Error {
  readonly userFacing = true;
  constructor(message: string) { super(message); this.name = "UserError"; }
}

type AnyError = { message?: string; code?: string; status?: number; name?: string; userFacing?: boolean } | null | undefined;

const GENERIC = "Something went wrong on our side. Please try again";

const OWN_CODES = new Set(["P0001", "KF401", "KF403", "KF429"]);
const PLAIN: Record<string, string> = {
  "23505": "That already exists.",
  "23514": "Some of the details aren’t valid. Check them and try again.",
  "22P02": "Some of the details aren’t valid. Check them and try again.",
  "23502": "A required detail is missing.",
  "42501": "You don’t have permission to do that.",
  PGRST301: "Your session has expired. Sign in again.",
  PGRST303: "Your session has expired. Sign in again.",
};

export function isRateLimited(err: unknown): boolean {
  const e = err as AnyError;
  return e?.code === "KF429" || e?.status === 429 || /rate limit|too many/i.test(e?.message ?? "");
}

export function friendly(err: unknown, where = "unknown", fallback = GENERIC): string {
  fallback = fallback.replace(/[.!]\s*$/, "");
  if (!err) return `${fallback}.`;
  if (typeof err === "string") return err;
  const e = err as AnyError;
  if (e?.userFacing && e.message) return e.message;
  if (isRateLimited(e)) return "Too many attempts. Please wait a while and try again.";
  // Supabase Auth errors (AuthApiError etc.) are already plain sentences such as "Invalid login credentials".
  if (e?.name?.startsWith("Auth") && e.message && e.name !== "AuthRetryableFetchError") return e.message;
  if (e?.code && OWN_CODES.has(e.code) && e.message) return e.message;
  if (e?.code && PLAIN[e.code]) return PLAIN[e.code];
  const ref = logError(where, err);
  return `${fallback} (ref ${ref}).`;
}
