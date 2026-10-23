"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/session";
import { flashQuery } from "@/lib/flash";
import { friendly } from "@/lib/errors";
import { parseForm, uuid } from "@/lib/schemas";
import { createInvitation, zonedIso } from "@/lib/visitors";
import { InviteForm } from "@/lib/visitorForms";

function back(tab: string, params: Record<string, string>): never {
  revalidatePath("/admin/visitors");
  redirect(`/admin/visitors?${flashQuery({ tab, ...params })}`);
}

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);

export async function inviteVisitor(formData: FormData) {
  const { supabase, org } = await requireMember({ viewer: true });
  const parsed = parseForm(InviteForm, formData);
  if (!parsed.ok) back("invite", { error: parsed.error });
  const f = parsed.data;
  const expectedAt = zonedIso(f.date, f.time, org.timezone);
  if (!expectedAt) back("invite", { error: "Choose the visit date and time." });
  const result = await createInvitation(supabase, org, { ...f, expectedAt });
  if (!result.ok) back("invite", { error: friendly(result.error, "admin/visitors/invite") });
  back("today", { msg: result.msg });
}

export async function signVisitor(visitId: string, signIn: boolean) {
  const { supabase } = await requireMember({ viewer: true });
  if (!uuid.safeParse(visitId).success) back("today", { error: "Visit not found." });
  const { data, error } = await supabase.rpc("vms_staff_sign", { p_visit: visitId, p_in: signIn });
  if (error) back("today", { error: friendly(error, "admin/visitors/sign") });
  const status = (data as { status?: string } | null)?.status;
  back("today", status === "denied" ? { error: "This visitor is on the blocklist and was not signed in." } : { msg: signIn ? "Visitor signed in." : "Visitor signed out." });
}

export async function cancelVisit(visitId: string) {
  const { supabase } = await requireMember({ viewer: true });
  const { error } = await supabase.rpc("vms_cancel", { p_visit: visitId });
  if (error) back("today", { error: friendly(error, "admin/visitors/cancel") });
  back("today", { msg: "Visit cancelled." });
}

const SettingsForm = z.object({
  rules: z.string().trim().min(1, "Write the visitor rules (a sentence is enough).").max(2000),
  retention: z.coerce.number().int().min(7, "Keep visitor details for at least 7 days.").max(365, "Keep visitor details for at most 365 days."),
});

export async function saveVisitorSettings(formData: FormData) {
  const { supabase } = await requireMember({ admin: true });
  const parsed = parseForm(SettingsForm, formData);
  if (!parsed.ok) back("settings", { error: parsed.error });
  const { error } = await supabase.rpc("vms_save_settings", {
    p_photo_required: formData.get("photo") === "on", p_rules: parsed.data.rules, p_retention_days: parsed.data.retention,
    p_notify_host: formData.get("notify") === "on",
  });
  if (error) back("settings", { error: friendly(error, "admin/visitors/settings") });
  back("settings", { msg: "Visitor settings saved." });
}

const BlockForm = z.object({ name: opt(120), email: opt(254), phone: opt(30), reason: opt(300) })
  .refine((b) => b.name || b.email || b.phone, { message: "Enter a name, email or phone number to block." });

export async function blockVisitor(formData: FormData) {
  const { supabase } = await requireMember({ admin: true });
  const parsed = parseForm(BlockForm, formData);
  if (!parsed.ok) back("blocklist", { error: parsed.error });
  const b = parsed.data;
  const { error } = await supabase.rpc("vms_block", { p_name: b.name, p_email: b.email, p_phone: b.phone, p_reason: b.reason });
  if (error) back("blocklist", { error: friendly(error, "admin/visitors/block") });
  back("blocklist", { msg: "Added to the blocklist." });
}

export async function unblockVisitor(id: string) {
  const { supabase } = await requireMember({ admin: true });
  const { error } = await supabase.rpc("vms_unblock", { p_id: id });
  if (error) back("blocklist", { error: friendly(error, "admin/visitors/unblock") });
  back("blocklist", { msg: "Removed from the blocklist." });
}

const TabletForm = z.object({ location: z.string().uuid("Choose an office."), name: z.string().trim().min(1).max(60).default("Reception tablet") });

export async function addTablet(formData: FormData) {
  const { supabase } = await requireMember({ admin: true });
  const parsed = parseForm(TabletForm, formData);
  if (!parsed.ok) back("settings", { error: parsed.error });
  const { data, error } = await supabase.rpc("vms_kiosk_pairing_code", { p_location: parsed.data.location, p_name: parsed.data.name, p_device: null });
  if (error) back("settings", { error: friendly(error, "admin/visitors/tablet") });
  back("settings", { msg: `Pairing code: ${data} — open /kiosk on the tablet and type it within 15 minutes.` });
}

export async function repairTablet(id: string) {
  const { supabase } = await requireMember({ admin: true });
  const { data, error } = await supabase.rpc("vms_kiosk_pairing_code", { p_location: null, p_name: null, p_device: id });
  if (error) back("settings", { error: friendly(error, "admin/visitors/tablet") });
  back("settings", { msg: `New pairing code: ${data} — the tablet’s old pairing stopped working. Type the code at /kiosk within 15 minutes.` });
}

export async function switchOffTablet(id: string) {
  const { supabase } = await requireMember({ admin: true });
  const { error } = await supabase.rpc("vms_kiosk_revoke", { p_device: id });
  if (error) back("settings", { error: friendly(error, "admin/visitors/tablet") });
  back("settings", { msg: "Tablet switched off. It can no longer sign visitors in." });
}
