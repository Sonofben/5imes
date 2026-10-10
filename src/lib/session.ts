import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Member = {
  id: string;
  org_id: string;
  user_id: string | null;
  email: string;
  full_name: string | null;
  role: "owner" | "admin" | "manager" | "staff";
  status: "invited" | "pending" | "active" | "disabled";
  team: string | null;
  home_lat: number | null;
  home_lng: number | null;
  home_status: "none" | "pending" | "approved" | "rejected";
  home_req_lat: number | null;
  home_req_lng: number | null;
  home_req_acc: number | null;
  home_req_at: string | null;
  created_at: string;
};

type MemberRow = Omit<Member, "home_lat" | "home_lng" | "home_req_lat" | "home_req_lng" | "home_req_acc" | "home_req_at">;

type PrivateLocation = Pick<Member, "home_lat" | "home_lng" | "home_req_lat" | "home_req_lng" | "home_req_acc" | "home_req_at">;

export type Org = {
  id: string;
  name: string;
  domain: string;
  timezone: string;
  work_start: string;
  work_end: string;
  grace_minutes: number;
  home_radius_m: number;
};

export type Subscription = {
  org_id: string;
  plan: "basic" | "pro";
  status: "trialing" | "active" | "past_due" | "cancelled";
  trial_ends_at: string | null;
  current_period_end: string | null;
  current_period_start: string | null;
  seats_paid: number;
  billing_interval_months: 1 | 3 | 6 | 12;
  cancel_at_period_end: boolean;
  paystack_customer?: string | null;
  paystack_plan_code?: string | null;
  paystack_subscription_code?: string | null;
};

/** Signed-in active member + their company. Redirects otherwise. */
export async function requireMember(opts: { admin?: boolean; viewer?: boolean } = {}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberRow } = await supabase
    .from("members")
    .select("id,org_id,user_id,email,full_name,role,status,team,home_status,created_at")
    .eq("user_id", user.id)
    .maybeSingle<MemberRow>();
  if (!memberRow) redirect("/start");
  if (memberRow.status === "pending") redirect("/pending");
  if (memberRow.status !== "active") redirect("/pending?disabled=1");

  const isAdmin = memberRow.role === "owner" || memberRow.role === "admin";
  const isViewer = isAdmin || memberRow.role === "manager";
  if (opts.admin && !isAdmin) redirect(isViewer ? "/admin" : "/app");
  if (opts.viewer && !isViewer) redirect("/app");

  const [{ data: org }, { data: privateLocation }] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", memberRow.org_id).single<Org>(),
    supabase.from("member_private_locations")
      .select("home_lat,home_lng,home_req_lat,home_req_lng,home_req_acc,home_req_at")
      .eq("member_id", memberRow.id).maybeSingle<PrivateLocation>(),
  ]);

  const me: Member = {
    ...memberRow,
    home_lat: privateLocation?.home_lat ?? null,
    home_lng: privateLocation?.home_lng ?? null,
    home_req_lat: privateLocation?.home_req_lat ?? null,
    home_req_lng: privateLocation?.home_req_lng ?? null,
    home_req_acc: privateLocation?.home_req_acc ?? null,
    home_req_at: privateLocation?.home_req_at ?? null,
  };
  return { supabase, user, me, org: org!, isAdmin, isViewer };
}

/** Today's date (YYYY-MM-DD) in the company's time zone. */
export function todayIn(tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function timeIn(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-NG", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(iso));
}

/** ISO weekday (1 = Monday … 7 = Sunday) in the company's time zone. */
export function isoWeekdayIn(tz: string) {
  const d = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date());
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(d) + 1;
}

/** Expected mode for a member today: personal override, else company default, else office. */
export function expectedMode(
  schedules: { member_id: string | null; weekday: number; mode: string }[],
  memberId: string,
  weekday: number
) {
  return (
    schedules.find((s) => s.member_id === memberId && s.weekday === weekday)?.mode ??
    schedules.find((s) => s.member_id === null && s.weekday === weekday)?.mode ??
    "office"
  );
}
