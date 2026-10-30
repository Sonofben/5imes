"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/session";
import { parseCsv } from "@/lib/csv";
import { flashQuery } from "@/lib/flash";
import { friendly } from "@/lib/errors";
import { z } from "zod";
import { email as emailField, parseForm, staffRole, uuid } from "@/lib/schemas";

const Invite = z.object({
  email: emailField,
  name: z.string().trim().max(120, "Name must be 120 characters or fewer.").default(""),
  role: staffRole.default("staff"),
  team: z.string().trim().max(60, "Team must be 60 characters or fewer.").default(""),
});

function back(params: Record<string, string>): never {
  revalidatePath("/admin", "layout");
  redirect(`/admin/staff?${flashQuery(params)}`);
}

async function sendInviteEmail(email: string, companyName?: string) {
  const admin = createAdminClient();
  if (!admin) return false;
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  // Invitees land on /auth/callback?type=invite, which routes them to
  // /auth/invite to pick their own password.
  const redirectTo = site ? `${site}/auth/callback?type=invite` : undefined;
  // company_name is shown in the invitation email ({{ .Data.company_name }}).
  const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: companyName ? { company_name: companyName } : undefined });
  return !error;
}

/** The plan's staff limit was hit: reopen the staff page with the Pro tour showing. */
function upgradeHint(error: { message?: string }): Record<string, string> {
  return /Upgrade to Pro/i.test(error.message ?? "") ? { upgrade: "staff" } : {};
}

export async function inviteOne(formData: FormData) {
  const { supabase, org } = await requireMember({ admin: true });
  const parsed = parseForm(Invite, formData);
  if (!parsed.ok) back({ error: parsed.error });
  const { email, name, role, team } = parsed.data;
  const { error } = await supabase.rpc("invite_member", { p_email: email, p_name: name, p_role: role, p_team: team });
  if (error) back({ error: friendly(error, "admin/staff"), ...upgradeHint(error) });
  const emailed = await sendInviteEmail(email, org.name);
  back({ msg: emailed ? `Invitation emailed to ${email}.` : `${email} was added. Ask them to sign in with that address.` });
}

export async function inviteBulk(formData: FormData) {
  const { supabase, org } = await requireMember({ admin: true });
  let parsed: string[][];
  try {
    parsed = parseCsv(String(formData.get("csv") || ""));
  } catch (error) {
    back({ error: friendly(error, "admin/staff", "Could not parse the CSV.") });
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
  if (error) back({ error: friendly(error, "admin/staff"), ...upgradeHint(error) });
  let emailCount = 0;
  for (const person of people) if (await sendInviteEmail(person.email, org.name)) emailCount++;
  back({ msg: `${Number(added ?? people.length)} invitations created${emailCount ? `; ${emailCount} emails sent` : ""}.` });
}

export async function setStatus(id: string, status: "active" | "disabled") {
  const supabase = await createClient();
  const { error } = await supabase.from("members").update({ status }).eq("id", id);
  if (error) back({ error: friendly(error, "admin/staff"), ...upgradeHint(error) });
  back({ msg: status === "active" ? "Access approved." : "Access disabled." });
}

export async function setRole(id: string, formData: FormData) {
  const supabase = await createClient();
  const parsed = staffRole.safeParse(formData.get("role"));
  if (!parsed.success) back({ error: "Choose a valid role." });
  const { error } = await supabase.from("members").update({ role: parsed.data }).eq("id", id);
  if (error) back({ error: friendly(error, "admin/staff"), ...upgradeHint(error) });
  back({ msg: "Role updated." });
}

export async function removeMember(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("members").delete().eq("id", id);
  if (error) back({ error: friendly(error, "admin/staff"), ...upgradeHint(error) });
  back({ msg: "Person removed." });
}

export async function reviewHome(id: string, approve: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_home_location", { p_member: id, p_approve: approve });
  if (error) back({ error: friendly(error, "admin/staff"), ...upgradeHint(error) });
  back({ msg: approve ? "Home location approved." : "Home location rejected." });
}

export async function setLineManager(id: string, formData: FormData) {
  const supabase = await createClient();
  const raw = String(formData.get("line_manager") || "");
  const manager = raw && uuid.safeParse(raw).success ? raw : "";
  if (raw && !manager) back({ error: "Choose a line manager from the list." });
  const { error } = await supabase.rpc("set_line_manager", { p_member: id, p_manager: manager || null });
  if (error) back({ error: friendly(error, "admin/staff"), ...upgradeHint(error) });
  back({ msg: manager ? "Line manager saved." : "Line manager cleared. Their requests go to admins." });
}
