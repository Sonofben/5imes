"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireConsole } from "@/lib/console";
import { createAdminClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";

function back(path: string, q: Record<string, string>): never {
  revalidatePath(path);
  redirect(`${path}?${new URLSearchParams(q)}`);
}
const reasonOf = (f: FormData) => String(f.get("reason") ?? "").trim();
const done = (path: string, error: { message: string } | null, msg: string, extra: Record<string, string> = {}) =>
  back(path, error ? { ...extra, error: error.message } : { ...extra, msg });

// ── People & security
export async function forceSignout(userId: string, email: string, f: FormData) {
  const { supabase } = await requireConsole();
  const { error } = await supabase.rpc("console_force_signout", { p_user: userId, p_reason: reasonOf(f) });
  done("/console/people", error, `${email} has been signed out everywhere.`, { email });
}
export async function setLocked(userId: string, email: string, locked: boolean, f: FormData) {
  const { supabase } = await requireConsole();
  const { error } = await supabase.rpc("console_set_locked", { p_user: userId, p_locked: locked, p_reason: reasonOf(f) });
  done("/console/people", error, locked ? `${email} is locked and signed out.` : `${email} is unlocked.`, { email });
}
export async function resetMfa(userId: string, email: string, f: FormData) {
  const { supabase } = await requireConsole();
  const { error } = await supabase.rpc("console_reset_mfa", { p_user: userId, p_reason: reasonOf(f) });
  done("/console/people", error, `Two-factor removed for ${email}. They will set it up again at next admin sign-in.`, { email });
}
export async function sendPasswordReset(email: string, orgId: string | null, f: FormData) {
  const { supabase } = await requireConsole();
  const { error: logError } = await supabase.rpc("console_note", { p_org: orgId, p_action: "app.password_reset_email", p_reason: reasonOf(f), p_details: { email } });
  if (logError) back("/console/people", { email, error: logError.message });
  const admin = createAdminClient();
  if (!admin) back("/console/people", { email, error: "Server is missing the service key, so emails cannot be sent." });
  const { error } = await admin.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl()}/auth/callback?type=recovery` });
  done("/console/people", error, `Password reset email sent to ${email}.`, { email });
}

// ── Announcements & platform settings
export async function announce(f: FormData) {
  const { supabase } = await requireConsole();
  const org = String(f.get("org") ?? "");
  const { error } = await supabase.rpc("console_announce", {
    p_message: String(f.get("message") ?? ""), p_level: String(f.get("level") ?? "info"), p_org: org || null,
    p_audience: String(f.get("audience") ?? "everyone"), p_hours: Number(f.get("hours") ?? 0), p_reason: reasonOf(f),
  });
  done("/console/announcements", error, "Announcement is live.");
}
export async function endAnnouncement(id: string) {
  const { supabase } = await requireConsole();
  const { error } = await supabase.rpc("console_end_announcement", { p_id: id });
  done("/console/announcements", error, "Announcement ended.");
}
export async function setPlatform(path: string, f: FormData) {
  const { supabase } = await requireConsole();
  const { error } = await supabase.rpc("console_set_platform", {
    p_trial_days: Number(f.get("trial_days")), p_maintenance: f.get("maintenance") === "on",
    p_message: String(f.get("maintenance_message") ?? ""), p_reason: reasonOf(f),
  });
  done(path, error, "Platform settings saved.");
}

// ── Plans & pricing
export async function savePlan(plan: string, f: FormData) {
  const { supabase } = await requireConsole();
  const max = String(f.get("max_locations") ?? "").trim();
  const { error } = await supabase.rpc("console_set_plan_terms", {
    p_plan: plan, p_name: String(f.get("name") ?? ""), p_price: Number(f.get("price")), p_blurb: String(f.get("blurb") ?? ""),
    p_features: String(f.get("features") ?? "").split("\n"), p_max_locations: max ? Number(max) : null, p_reason: reasonOf(f),
  });
  done("/console/pricing", error, "Plan saved. New prices apply to new payments; existing paid terms are unchanged.");
}

// ── Team
export async function teamAdd(f: FormData) {
  const { supabase } = await requireConsole();
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const args = { p_email: email, p_role: String(f.get("role") ?? "viewer"), p_reason: reasonOf(f) };
  let { error } = await supabase.rpc("console_team_add", args);
  let invited = false;
  if (error?.message.includes("No 5ime login")) {
    // No login yet: send them an invitation (creates the login), then add them.
    const admin = createAdminClient();
    if (!admin) back("/console/team", { error: "Server is missing the service key, so the invitation cannot be sent." });
    const inv = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${siteUrl()}/auth/callback?type=invite` });
    if (inv.error) back("/console/team", { error: inv.error.message });
    invited = true;
    ({ error } = await supabase.rpc("console_team_add", args));
  }
  done("/console/team", error, invited
    ? `Invitation emailed to ${email}. After setting a password and two-factor they land in Global Admin.`
    : "Added to the Global Admin team. They must set up two-factor at their next sign-in.");
}
export async function teamSetRole(userId: string, f: FormData) {
  const { supabase } = await requireConsole();
  const { error } = await supabase.rpc("console_team_set_role", { p_user: userId, p_role: String(f.get("role") ?? ""), p_reason: reasonOf(f) });
  done("/console/team", error, "Role updated.");
}
export async function teamRemove(userId: string, f: FormData) {
  const { supabase } = await requireConsole();
  const { error } = await supabase.rpc("console_team_remove", { p_user: userId, p_reason: reasonOf(f) });
  done("/console/team", error, "Removed from the Global Admin team.");
}
