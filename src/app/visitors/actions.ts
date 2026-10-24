"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";
import { flashQuery } from "@/lib/flash";
import { friendly } from "@/lib/errors";
import { parseForm, uuid } from "@/lib/schemas";
import { Admission, parseOrNull } from "@/lib/jsonShapes";
import { alertHostAdmitted, createInvitation, PHOTO_BUCKET, zonedIso } from "@/lib/visitors";
import { InviteForm, VisitorSettingsForm } from "@/lib/visitorForms";
import { log } from "@/lib/log";

/** Back to a Visitors page with a signed message. */
function back(path: string, params: Record<string, string>): never {
  revalidatePath("/visitors", "layout");
  redirect(`${path}${path.includes("?") ? "&" : "?"}${flashQuery(params)}`);
}
const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const optId = z.string().uuid().optional().or(z.literal("")).transform((v) => v || null);

// ───────────────────────────── desk
export async function admitVisitor(visitId: string, formData: FormData) {
  const { supabase, org } = await requireMember({ desk: true });
  if (!uuid.safeParse(visitId).success) back("/visitors", { error: "Visit not found." });
  const host = optId.safeParse(formData.get("host") ?? "");
  const { data, error } = await supabase.rpc("vms_admit", { p_visit: visitId, p_host: host.success ? host.data : null });
  if (error) back("/visitors", { error: friendly(error, "visitors/admit") });
  const result = parseOrNull(Admission, data, "visitors/admit");
  if (result?.status === "denied") back("/visitors", { error: "This visitor is on the blocklist and was not let in." });
  const emailed = result ? await alertHostAdmitted(result, org.timezone) : false;
  back("/visitors", { msg: `${result?.visitor ?? "Visitor"} is in.${emailed ? ` ${result?.host_name ?? "The host"} has been emailed.` : ""}` });
}

export async function turnAwayVisitor(visitId: string, formData: FormData) {
  const { supabase } = await requireMember({ desk: true });
  const reason = opt(200).safeParse(formData.get("reason") ?? "");
  const { error } = await supabase.rpc("vms_turn_away", { p_visit: visitId, p_reason: reason.success ? reason.data : null });
  if (error) back("/visitors", { error: friendly(error, "visitors/turn-away") });
  back("/visitors", { msg: "Visitor turned away." });
}

export async function signOutVisitor(visitId: string) {
  const { supabase } = await requireMember({ desk: true });
  const { error } = await supabase.rpc("vms_staff_sign", { p_visit: visitId, p_in: false });
  if (error) back("/visitors", { error: friendly(error, "visitors/sign-out") });
  back("/visitors", { msg: "Visitor signed out." });
}

// ───────────────────────────── invitations
export async function inviteVisitor(formData: FormData) {
  const { supabase, org } = await requireMember({ desk: true });
  const parsed = parseForm(InviteForm, formData);
  if (!parsed.ok) back("/visitors/invitations", { error: parsed.error });
  const f = parsed.data;
  const expectedAt = zonedIso(f.date, f.time, org.timezone);
  if (!expectedAt) back("/visitors/invitations", { error: "Choose the visit date and time." });
  const result = await createInvitation(supabase, org, { ...f, expectedAt });
  if (!result.ok) back("/visitors/invitations", { error: friendly(result.error, "visitors/invite") });
  back("/visitors/invitations", { msg: result.msg });
}

export async function cancelVisit(visitId: string) {
  const { supabase } = await requireMember({ desk: true });
  const { error } = await supabase.rpc("vms_cancel", { p_visit: visitId });
  if (error) back("/visitors/invitations", { error: friendly(error, "visitors/cancel") });
  back("/visitors/invitations", { msg: "Visit cancelled." });
}

// ───────────────────────────── settings (admins)
export async function saveVisitorSettings(formData: FormData) {
  const { supabase } = await requireMember({ admin: true });
  const parsed = parseForm(VisitorSettingsForm, formData);
  if (!parsed.ok) back("/visitors/settings", { error: parsed.error });
  const f = parsed.data;
  const { error } = await supabase.rpc("vms_update_settings", {
    p_photo_required: f.photo, p_rules: f.rules, p_retention_days: f.retention, p_notify_host: f.notify, p_require_admit: f.admit,
    p_auto_admit_invited: f.autoInvited, p_office_hours_only: f.hours, p_privacy_notice: f.notice, p_photo_retention_days: f.photoRetention,
  });
  if (error) back("/visitors/settings", { error: friendly(error, "visitors/settings") });
  back("/visitors/settings", { msg: "Visitor settings saved." });
}

export async function createVisitorLink(locationId: string) {
  const { supabase } = await requireMember({ admin: true });
  const { error } = await supabase.rpc("vms_visitor_link", { p_location: locationId });
  if (error) back("/visitors/settings", { error: friendly(error, "visitors/link") });
  back("/visitors/settings", { msg: "Visitor link created. Print the poster for reception." });
}

export async function replaceVisitorLink(locationId: string) {
  const { supabase } = await requireMember({ admin: true });
  const { error } = await supabase.rpc("vms_rotate_visitor_link", { p_location: locationId });
  if (error) back("/visitors/settings", { error: friendly(error, "visitors/link") });
  back("/visitors/settings", { msg: "New visitor link made. The old poster no longer works — print the new one." });
}

export async function setReceptionAccess(memberId: string, on: boolean) {
  const { supabase } = await requireMember({ admin: true });
  const { error } = await supabase.rpc("vms_set_reception", { p_member: memberId, p_on: on });
  if (error) back("/visitors/settings", { error: friendly(error, "visitors/reception") });
  back("/visitors/settings", { msg: on ? "Reception desk access given." : "Reception desk access removed." });
}

const TabletForm = z.object({ location: z.string().uuid("Choose an office."), name: z.string().trim().min(1).max(60).default("Reception tablet") });

export async function addTablet(formData: FormData) {
  const { supabase } = await requireMember({ admin: true });
  const parsed = parseForm(TabletForm, formData);
  if (!parsed.ok) back("/visitors/settings", { error: parsed.error });
  const { data, error } = await supabase.rpc("vms_kiosk_pairing_code", { p_location: parsed.data.location, p_name: parsed.data.name, p_device: null });
  if (error) back("/visitors/settings", { error: friendly(error, "visitors/tablet") });
  back("/visitors/settings", { msg: `Pairing code: ${data} — open /kiosk on the tablet and type it within 15 minutes.` });
}

export async function repairTablet(id: string) {
  const { supabase } = await requireMember({ admin: true });
  const { data, error } = await supabase.rpc("vms_kiosk_pairing_code", { p_location: null, p_name: null, p_device: id });
  if (error) back("/visitors/settings", { error: friendly(error, "visitors/tablet") });
  back("/visitors/settings", { msg: `New pairing code: ${data} — the tablet’s old pairing stopped working. Type the code at /kiosk within 15 minutes.` });
}

export async function switchOffTablet(id: string) {
  const { supabase } = await requireMember({ admin: true });
  const { error } = await supabase.rpc("vms_kiosk_revoke", { p_device: id });
  if (error) back("/visitors/settings", { error: friendly(error, "visitors/tablet") });
  back("/visitors/settings", { msg: "Tablet switched off. It can no longer sign visitors in." });
}

// ───────────────────────────── blocklist (admins)
const BlockForm = z.object({ name: opt(120), email: opt(254), phone: opt(30), reason: opt(300) })
  .refine((b) => b.name || b.email || b.phone, { message: "Enter a name, email or phone number to block." });

export async function blockVisitor(formData: FormData) {
  const { supabase } = await requireMember({ admin: true });
  const parsed = parseForm(BlockForm, formData);
  if (!parsed.ok) back("/visitors/blocklist", { error: parsed.error });
  const b = parsed.data;
  const { error } = await supabase.rpc("vms_block", { p_name: b.name, p_email: b.email, p_phone: b.phone, p_reason: b.reason });
  if (error) back("/visitors/blocklist", { error: friendly(error, "visitors/block") });
  back("/visitors/blocklist", { msg: "Added to the blocklist." });
}

export async function unblockVisitor(id: string) {
  const { supabase } = await requireMember({ admin: true });
  const { error } = await supabase.rpc("vms_unblock", { p_id: id });
  if (error) back("/visitors/blocklist", { error: friendly(error, "visitors/unblock") });
  back("/visitors/blocklist", { msg: "Removed from the blocklist." });
}

// ───────────────────────────── a visitor's data request (admins). Returns data to the page; nothing goes in the URL.
export type DsrState = { query: string; rows: { id: string; name: string; email: string | null; phone: string | null; company: string | null; status: string; at: string }[]; error?: string; done?: string };
const DsrQuery = z.string().trim().min(3, "Enter the visitor’s full email address or phone number.").max(254);

export async function findVisitorData(_prev: DsrState, formData: FormData): Promise<DsrState> {
  const { supabase } = await requireMember({ admin: true });
  const q = DsrQuery.safeParse(formData.get("query") ?? "");
  if (!q.success) return { query: "", rows: [], error: q.error.issues[0]?.message };
  if (formData.get("intent") === "erase") {
    const { data, error } = await supabase.rpc("vms_forget_visitor", { p_query: q.data });
    if (error) return { query: q.data, rows: [], error: friendly(error, "visitors/dsr-erase") };
    const paths = (data ?? []).map((r) => r.photo_path).filter((p): p is string => !!p);
    const admin = createAdminClient();
    if (admin && paths.length) {
      const { error: rm } = await admin.storage.from(PHOTO_BUCKET).remove(paths);
      if (rm) log.error("visitors.dsr.photos", { message: rm.message, count: paths.length });
    }
    return { query: q.data, rows: [], done: "Their details were erased. The erasure is recorded in the audit trail." };
  }
  const { data, error } = await supabase.rpc("vms_find_visitor", { p_query: q.data });
  if (error) return { query: q.data, rows: [], error: friendly(error, "visitors/dsr-find") };
  return { query: q.data, rows: data ?? [] };
}
