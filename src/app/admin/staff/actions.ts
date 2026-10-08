"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";

function back(params: Record<string, string>): never {
  revalidatePath("/admin", "layout");
  redirect(`/admin/staff?${new URLSearchParams(params)}`);
}

async function sendInviteEmail(email: string) {
  const admin = createAdminClient();
  if (!admin) return false;
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: site ? `${site}/auth/callback` : undefined,
  });
  return !error;
}

export async function inviteOne(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const { error } = await supabase.rpc("invite_member", {
    p_email: email,
    p_name: String(formData.get("name") || ""),
    p_role: String(formData.get("role") || "staff"),
    p_team: String(formData.get("team") || ""),
  });
  if (error) back({ error: error.message });
  const emailed = await sendInviteEmail(email);
  back({ msg: emailed ? `Invite emailed to ${email}.` : `${email} added. Ask them to sign in at your 5ime link with that email.` });
}

export async function inviteBulk(formData: FormData) {
  const supabase = await createClient();
  const lines = String(formData.get("csv") || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^email\s*,/i.test(l));
  let ok = 0;
  const failed: string[] = [];
  for (const line of lines.slice(0, 500)) {
    const [email, name = "", team = ""] = line.split(",").map((s) => s.trim());
    const { error } = await supabase.rpc("invite_member", { p_email: email, p_name: name, p_role: "staff", p_team: team });
    if (error) failed.push(`${email}: ${error.message}`);
    else {
      ok++;
      await sendInviteEmail(email.toLowerCase());
    }
  }
  back(failed.length ? { msg: `${ok} added.`, error: failed.slice(0, 5).join(" · ") } : { msg: `${ok} people added.` });
}

export async function setStatus(id: string, status: "active" | "disabled") {
  const supabase = await createClient();
  const { error } = await supabase.from("members").update({ status }).eq("id", id);
  if (error) back({ error: error.message });
  back({ msg: status === "active" ? "Access approved." : "Access disabled." });
}

export async function setRole(id: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("members").update({ role: String(formData.get("role")) }).eq("id", id);
  if (error) back({ error: error.message });
  back({ msg: "Role updated." });
}

export async function removeMember(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("members").delete().eq("id", id);
  if (error) back({ error: error.message });
  back({ msg: "Removed." });
}

export async function reviewHome(id: string, approve: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_home_location", { p_member: id, p_approve: approve });
  if (error) back({ error: error.message });
  back({ msg: approve ? "Home location approved." : "Home location rejected." });
}
