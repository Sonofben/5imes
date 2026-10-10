"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/session";
import { parseCsv } from "@/lib/csv";

function back(params: Record<string, string>): never {
  revalidatePath("/admin", "layout");
  redirect(`/admin/staff?${new URLSearchParams(params)}`);
}

async function sendInviteEmail(email: string) {
  const admin = createAdminClient();
  if (!admin) return false;
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: site ? `${site}/auth/callback` : undefined });
  return !error;
}

export async function inviteOne(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email) back({ error: "Enter a work email address." });
  const { error } = await supabase.rpc("invite_member", {
    p_email: email,
    p_name: String(formData.get("name") || "").trim(),
    p_role: String(formData.get("role") || "staff"),
    p_team: String(formData.get("team") || "").trim(),
  });
  if (error) back({ error: error.message });
  const emailed = await sendInviteEmail(email);
  back({ msg: emailed ? `Invitation emailed to ${email}.` : `${email} was added. Ask them to sign in with that address.` });
}

export async function inviteBulk(formData: FormData) {
  const { supabase, org } = await requireMember({ admin: true });
  let parsed: string[][];
  try {
    parsed = parseCsv(String(formData.get("csv") || ""));
  } catch (error) {
    back({ error: error instanceof Error ? error.message : "Could not parse the CSV." });
  }
  if (parsed.length && parsed[0][0]?.trim().toLowerCase() === "email") parsed.shift();
  if (parsed.length < 1) back({ error: "Paste at least one staff row." });
  if (parsed.length > 500) back({ error: "Import is limited to 500 people at a time." });

  const seen = new Set<string>();
  const people: { email: string; name: string; team: string }[] = [];
  const problems: string[] = [];
  parsed.forEach((row, index) => {
    const rowNumber = index + 1;
    const [emailCell = "", name = "", team = "", ...extra] = row;
    const email = emailCell.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push(`Row ${rowNumber}: invalid email.`);
    else if (email.split("@")[1] !== org.domain.toLowerCase()) problems.push(`Row ${rowNumber}: ${email} must use @${org.domain}.`);
    else if (seen.has(email)) problems.push(`Row ${rowNumber}: ${email} appears more than once.`);
    if (extra.some((value) => value.trim())) problems.push(`Row ${rowNumber}: use only email, name, and team columns.`);
    if (email) seen.add(email);
    people.push({ email, name: name.trim(), team: team.trim() });
  });
  if (problems.length) back({ error: problems.slice(0, 6).join(" · ") + (problems.length > 6 ? ` · and ${problems.length - 6} more` : "") });

  const { data: added, error } = await supabase.rpc("invite_members_bulk", { p_members: people });
  if (error) back({ error: error.message });
  let emailCount = 0;
  for (const person of people) if (await sendInviteEmail(person.email)) emailCount++;
  back({ msg: `${Number(added ?? people.length)} invitations created${emailCount ? `; ${emailCount} emails sent` : ""}.` });
}

export async function setStatus(id: string, status: "active" | "disabled") {
  const supabase = await createClient();
  const { error } = await supabase.from("members").update({ status }).eq("id", id);
  if (error) back({ error: error.message });
  back({ msg: status === "active" ? "Access approved." : "Access disabled." });
}

export async function setRole(id: string, formData: FormData) {
  const supabase = await createClient();
  const role = String(formData.get("role") || "");
  if (!["staff", "manager", "admin"].includes(role)) back({ error: "Choose a valid role." });
  const { error } = await supabase.from("members").update({ role }).eq("id", id);
  if (error) back({ error: error.message });
  back({ msg: "Role updated." });
}

export async function removeMember(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("members").delete().eq("id", id);
  if (error) back({ error: error.message });
  back({ msg: "Person removed." });
}

export async function reviewHome(id: string, approve: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_home_location", { p_member: id, p_approve: approve });
  if (error) back({ error: error.message });
  back({ msg: approve ? "Home location approved." : "Home location rejected." });
}
