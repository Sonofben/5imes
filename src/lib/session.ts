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
  seats_paid: number;
};

/** Signed-in active member + their company. Redirects otherwise. */
export async function requireMember(opts: { admin?: boolean; viewer?: boolean } = {}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("members")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle<Member>();
  if (!me) redirect("/start");
  if (me.status === "pending") redirect("/pending");
  if (me.status !== "active") redirect("/pending?disabled=1");

  const isAdmin = me.role === "owner" || me.role === "admin";
  const isViewer = isAdmin || me.role === "manager";
  if (opts.admin && !isAdmin) redirect(isViewer ? "/admin" : "/app");
  if (opts.viewer && !isViewer) redirect("/app");

  const { data: org } = await supabase.from("organizations").select("*").eq("id", me.org_id).single<Org>();

  return { supabase, user, me, org: org!, isAdmin, isViewer };
}

/** Today's date (YYYY-MM-DD) in the company's time zone. */
export function todayIn(tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date()
  );
}

export function timeIn(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-NG", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: true }).format(
    new Date(iso)
  );
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
