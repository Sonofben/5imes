import { z } from "zod";
import { logError } from "./log.ts";

/**
 * Shapes of the jsonb returned by our own database functions. TypeScript cannot see inside
 * jsonb, so each page parses the result with the matching schema instead of `as SomeType`.
 * If a migration changes a function's output, the page shows a clear error (and the log
 * says which field) rather than rendering half-broken data.
 *
 * test/json-shapes.test.mjs checks these schemas against the real functions' output.
 */
const num = z.coerce.number();
const str = z.string();
const opt = <T extends z.ZodTypeAny>(t: T) => t.nullable().optional();

/** Parse; on a mismatch log the problem and return null. */
export function parseOrNull<T extends z.ZodTypeAny>(schema: T, data: unknown, where: string): z.infer<T> | null {
  const parsed = schema.safeParse(data);
  if (parsed.success) return parsed.data;
  logError(`${where}.shape`, new Error("Unexpected data shape"), { issues: parsed.error.issues.slice(0, 5) });
  return null;
}

// public_plans()
export const PublicPlans = z.object({
  trial_days: num.optional(),
  plans: z.array(z.object({
    id: z.enum(["basic", "pro", "premium"]), name: str, pricePerSeat: num, blurb: str,
    features: z.array(str).nullable().optional(), maxLocations: opt(num),
  })).optional(),
});

// report_presence()
export const Presence = z.object({ status: str, departed_at: opt(str), request_status: opt(str) }).passthrough();
export type Presence = z.infer<typeof Presence>;

// console_overview()
export const ConsoleOverview = z.object({
  companies: num, trialing: num, paying: num, expired: num, suspended: num, seats_used: num, seats_paid: num,
  revenue_month_kobo: num, new_this_week: num, ending_soon: num,
});

// console_health()
export const ConsoleHealth = z.object({
  companies_active_7d: num, people_active_7d: num, checkins_today: num,
  checkins_by_day: z.array(z.object({ day: str, checkins: num })),
  signups_by_week: z.array(z.object({ week: str, companies: num })),
  at_risk: z.array(z.object({ id: str, name: str, domain: str, reason: str, last_check_in: opt(str) })),
});

// console_revenue()
export const ConsoleRevenue = z.object({
  this_month_kobo: num, last_month_kobo: num, year_kobo: num, all_time_kobo: num, monthly_run_rate_kobo: num,
  paying_companies: num, pending_count: num, failed_count_30d: num,
  by_month: z.array(z.object({ month: str, kobo: num, payments: num })),
  by_plan: z.record(z.string(), num), by_provider: z.record(z.string(), num),
});

// console_company(id)
export const ConsoleCompany = z.object({
  org: z.object({ id: str, name: str, domain: str, slug: str, timezone: str, created_at: str, suspended_at: opt(str), logo_url: opt(str), archived_at: opt(str) }),
  owner: z.object({ name: opt(str), email: str }).nullable(),
  subscription: z.object({
    plan: str, status: str, trial_ends_at: opt(str), current_period_end: opt(str), seats_paid: num, billing_interval_months: num,
    paystack_subscription_code: opt(str), cancel_at_period_end: z.boolean(),
  }).nullable(),
  counts: z.object({ active: num, invited: num, pending: num, disabled: num, stale_invites: num, offices: num }),
  last_check_in: opt(str),
  support_until: opt(str),
  payments: z.array(z.object({
    reference: str, provider: str, kind: str, status: str, plan: str, seats: num, billing_interval_months: num, amount_kobo: num, created_at: str, note: opt(str),
  })),
  audit: z.array(z.object({ at: str, action: str, actor_email: opt(str), reason: opt(str) })),
});

// console_company_snapshot(id)
export const ConsoleSnapshot = z.object({
  org: z.object({ name: str, domain: str, timezone: str, work_start: str, work_end: str, grace_minutes: num, home_radius_m: num, slug: str }),
  today: str,
  people: z.array(z.object({
    id: str, name: str, email: str, role: str, status: str, team: opt(str), home_status: str, line_manager: opt(str),
    today: z.array(z.object({ kind: str, at: str, type: str, flags: z.array(str) })).nullable(),
  })),
  locations: z.array(z.object({ name: str, lat: num, lng: num, radius_m: num, address: opt(str) })),
  schedule: z.array(z.object({ weekday: num, mode: str })),
  pending: z.object({ people: num, homes: num, corrections: num, location_requests: num }),
});

// console_plans()
export const ConsolePlans = z.object({
  trial_days: num,
  plans: z.array(z.object({ id: z.enum(["basic", "pro", "premium"]), name: str, pricePerSeat: num, blurb: str, features: z.array(str), maxLocations: opt(num) })),
  maintenance_mode: z.boolean(),
  maintenance_message: opt(str),
});

// console_security()
export const ConsoleSecurity = z.object({
  admin_2fa: z.array(z.object({ id: str, name: str, admins: num, with_2fa: num, missing: num })),
  locked: z.array(z.object({ user_id: str, email: str, company: opt(str) })),
  sign_ins_24h: num, sign_ins_7d: num,
  events: z.array(z.object({ created_at: str, kind: str, email: opt(str), company: opt(str) })),
  global_admin_actions: z.array(z.object({ at: str, actor_email: opt(str), action: str, reason: opt(str) })),
});

// console_company_export(id) — only the part the download route reads
export const ConsoleExportHead = z.object({ org: z.object({ domain: opt(str) }).passthrough().optional() }).passthrough();

// visit_pass(token) — what a visitor's pass page shows
export const VisitPass = z.object({
  name: str, code: str, status: str, expected_at: opt(str), signed_in_at: opt(str), purpose: opt(str),
  org: str, timezone: str, host: opt(str),
  location: z.object({ name: str, address: opt(str), lat: opt(num), lng: opt(num) }).nullable(),
  arrived_at: opt(str), walk_in: z.boolean().optional(), phone: opt(str), company: opt(str), reason: opt(str), host_hint: opt(str),
  rules_text: opt(str), privacy_notice: opt(str), retention_days: opt(num),
});
export type VisitPass = z.infer<typeof VisitPass>;

// walkin_context(link): the office behind a visitor QR poster
export const WalkinContext = z.object({
  org: z.object({ name: str, logo_url: opt(str), timezone: str }),
  location: opt(str), open: z.boolean(), rules_text: str, privacy_notice: str, retention_days: num,
});
export type WalkinContext = z.infer<typeof WalkinContext>;

// walkin_submit
export const WalkinResult = z.object({ pass_token: str, status: z.enum(["waiting", "on_site", "denied"]) });

// visit_checkin, vms_admit: "waiting"/"denied" carry only the visit; "on_site" adds what the host alert needs
export const Admission = z.object({
  status: z.enum(["waiting", "on_site", "denied", "left"]), visit: str, code: opt(str), visitor: opt(str), company: opt(str),
  signed_in_at: opt(str), location: opt(str), host_name: opt(str), host_email: opt(str), reason: opt(str),
});
export type Admission = z.infer<typeof Admission>;

// vms_desk_find
export const DeskVisit = z.object({
  id: str, status: str, name: str, company: opt(str), phone: opt(str), walk_in: z.boolean(), reason: opt(str), purpose: opt(str),
  host_hint: opt(str), expected_at: opt(str), arrived_at: opt(str), signed_in_at: opt(str), code: str, host: opt(str), location: opt(str),
});
export type DeskVisit = z.infer<typeof DeskVisit>;

// vms_report
export const VisitorReport = z.object({
  total: num, previous_total: num, walk_ins: num, invited: num, avg_minutes: opt(num), longest_minutes: opt(num),
  turned_away: num, auto_signed_out: num, no_shows: num, by_weekday: z.array(num),
  by_reason: z.array(z.object({ reason: str, count: num })), by_day: z.array(z.object({ day: str, count: num })),
  top_hosts: z.array(z.object({ name: str, count: num })),
});
export type VisitorReport = z.infer<typeof VisitorReport>;

// kiosk_context(token)
export const KioskContext = z.object({
  device: str, device_name: str, org_id: str,
  org: z.object({ name: str, logo_url: opt(str), brand_color: opt(str), timezone: str }),
  location: z.object({ id: str, name: str }).nullable(),
  photo_required: z.boolean(), rules_text: str,
});
export type KioskContext = z.infer<typeof KioskContext>;

// kiosk_find_visit
export const KioskVisit = z.object({ id: str, status: str, name: str, company: opt(str), host: opt(str) });
export type KioskVisit = z.infer<typeof KioskVisit>;

// kiosk_sign_in
export const KioskSignIn = z.object({
  status: z.enum(["on_site", "denied", "waiting"]), visit: str, visitor: str, code: opt(str), company: opt(str), signed_in_at: opt(str),
  location: opt(str), host_name: opt(str), host_email: opt(str),
});
export type KioskSignIn = z.infer<typeof KioskSignIn>;

// vms_invite
export const Invitation = z.object({ id: str, code: str, pass_token: str });
