"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";
import { flashQuery } from "@/lib/flash";
import { friendly } from "@/lib/errors";
import { parseCsv } from "@/lib/csv";
import { uuid } from "@/lib/schemas";
import { emailLeaveDecided } from "@/lib/leave";

function back(path: string, q: Record<string, string>): never {
  revalidatePath("/admin/leave", "layout");
  redirect(`${path}?${flashQuery(q)}`);
}
const S = "/admin/leave/settings";
const num = (v: FormDataEntryValue | null) => { const s = String(v ?? "").trim(); return s === "" ? null : Number(s); };

// ── decisions (line managers and admins)
export async function decideLeave(id: string, approve: boolean, f: FormData) {
  const { supabase } = await requireMember({ viewer: true });
  if (!uuid.safeParse(id).success) back("/admin/leave", { error: "Unknown request." });
  const { error } = await supabase.rpc("decide_leave", { p_id: id, p_approve: approve, p_note: String(f.get("note") ?? "") });
  if (error) back("/admin/leave", { error: friendly(error, "admin/leave/decide") });
  await emailLeaveDecided(createAdminClient(), id);
  back("/admin/leave", { msg: approve ? "Approved. They’ve been emailed." : "Declined. They’ve been emailed." });
}

export async function adminCancelLeave(id: string) {
  const { supabase } = await requireMember({ admin: true });
  if (!uuid.safeParse(id).success) back("/admin/leave", { error: "Unknown request." });
  const { error } = await supabase.rpc("cancel_leave", { p_id: id });
  if (error) back("/admin/leave", { error: friendly(error, "admin/leave/cancel") });
  back("/admin/leave", { msg: "Leave cancelled." });
}

// ── settings (admins)
export async function saveLeaveYear(f: FormData) {
  const { supabase } = await requireMember({ admin: true });
  const { error } = await supabase.rpc("admin_leave_settings", {
    p_mode: String(f.get("mode") ?? "calendar"), p_start_month: Number(f.get("start_month") ?? 1), p_prorate: f.get("prorate") === "on",
  });
  if (error) back(S, { error: friendly(error, "admin/leave/year") });
  back(S, { msg: "Leave year saved." });
}

export async function saveLeaveType(id: string | null, f: FormData) {
  const { supabase } = await requireMember({ admin: true });
  if (id && !uuid.safeParse(id).success) back(S, { error: "Unknown leave type." });
  const unlimited = f.get("unlimited") === "on";
  const { error } = await supabase.rpc("admin_save_leave_type", {
    p_id: id, p_name: String(f.get("name") ?? ""), p_paid: f.get("paid") === "on", p_default_days: unlimited ? null : num(f.get("days")) ?? 0,
    p_counts_weekends: f.get("weekends") === "on", p_needs_approval: f.get("approval") !== "off",
    p_document_after_days: f.get("needs_doc") === "on" ? num(f.get("doc_after")) ?? 0 : null,
    p_carry_mode: String(f.get("carry") ?? "none"), p_carry_max: num(f.get("carry_max")), p_carry_expiry_months: num(f.get("carry_expiry")),
    p_active: f.get("active") === "on",
  });
  if (error) back(S, { error: friendly(error, "admin/leave/type") });
  back(S, { msg: id ? "Leave type saved." : "Leave type added." });
}

export async function addLeaveRule(f: FormData) {
  const { supabase } = await requireMember({ admin: true });
  const role = String(f.get("role") ?? "");
  const { error } = await supabase.rpc("admin_save_leave_rule", {
    p_type: String(f.get("type") ?? ""), p_team: String(f.get("team") ?? ""), p_role: role || null,
    p_min_years: num(f.get("min_years")), p_days: num(f.get("days")) ?? 0,
  });
  if (error) back(S, { error: friendly(error, "admin/leave/rule") });
  back(S, { msg: "Rule added. Allowances update straight away." });
}

export async function removeLeaveRule(id: string) {
  const { supabase } = await requireMember({ admin: true });
  const { error } = await supabase.rpc("admin_remove_leave_rule", { p_id: id });
  if (error) back(S, { error: friendly(error, "admin/leave/rule") });
  back(S, { msg: "Rule removed." });
}

/** Tick several people and give them all the same allowance (or "reset" back to the default and rules). */
export async function bulkAllowance(type: string, f: FormData) {
  const { supabase } = await requireMember({ admin: true });
  const members = f.getAll("member").map(String).filter((m) => uuid.safeParse(m).success);
  if (!members.length) back(S, { error: "Tick at least one person.", type });
  const reset = f.get("reset") === "on";
  const days = num(f.get("days"));
  if (!reset && (days === null || !Number.isFinite(days))) back(S, { error: "Enter the number of days.", type });
  const { error } = await supabase.rpc("admin_set_allowances", {
    p_rows: members.map((m) => ({ member_id: m, leave_type_id: type, days: reset ? null : days })), p_note: String(f.get("note") ?? ""),
  });
  if (error) back(S, { error: friendly(error, "admin/leave/allowances"), type });
  back(S, { msg: `${members.length} ${members.length === 1 ? "person" : "people"} updated.`, type });
}

/** Spreadsheet import: email, leave type, days. */
export async function importAllowances(f: FormData) {
  const { supabase, org } = await requireMember({ admin: true });
  let rows: string[][];
  try { rows = parseCsv(String(f.get("csv") ?? "")); } catch (e) { back(S, { error: friendly(e, "admin/leave/import", "Could not read the list.") }); }
  if (rows.length && rows[0][0]?.trim().toLowerCase() === "email") rows.shift();
  if (!rows.length) back(S, { error: "Paste at least one row." });
  const [{ data: people }, { data: types }] = await Promise.all([
    supabase.from("members").select("id,email").eq("org_id", org.id),
    supabase.from("leave_types").select("id,name").eq("org_id", org.id),
  ]);
  const byEmail = new Map((people ?? []).map((p) => [p.email.toLowerCase(), p.id]));
  const byType = new Map((types ?? []).map((t) => [t.name.toLowerCase(), t.id]));
  const problems: string[] = [];
  const out = rows.map(([email = "", type = "", days = ""], i) => {
    const m = byEmail.get(email.trim().toLowerCase()), t = byType.get(type.trim().toLowerCase()), d = Number(days.trim());
    if (!m) problems.push(`Row ${i + 1}: no one with ${email.trim() || "that email"}`);
    else if (!t) problems.push(`Row ${i + 1}: no leave type called “${type.trim()}”`);
    else if (days.trim() === "" || !Number.isFinite(d) || d < 0 || d > 366) problems.push(`Row ${i + 1}: days must be 0 to 366`);
    return { member_id: m, leave_type_id: t, days: d };
  });
  if (problems.length) back(S, { error: problems.slice(0, 6).join(" · ") + (problems.length > 6 ? ` · and ${problems.length - 6} more` : "") });
  const { data: n, error } = await supabase.rpc("admin_set_allowances", { p_rows: out, p_note: "Imported" });
  if (error) back(S, { error: friendly(error, "admin/leave/import") });
  back(S, { msg: `${n} allowances imported.` });
}

/** Spreadsheet import: email, start date (YYYY-MM-DD or DD/MM/YYYY), birthday (DD/MM). Empty cells are left alone. */
export async function importStaffDetails(f: FormData) {
  const { supabase, org } = await requireMember({ admin: true });
  let rows: string[][];
  try { rows = parseCsv(String(f.get("csv") ?? "")); } catch (e) { back(S, { error: friendly(e, "admin/staff-details", "Could not read the list.") }); }
  if (rows.length && rows[0][0]?.trim().toLowerCase() === "email") rows.shift();
  if (!rows.length) back(S, { error: "Paste at least one row." });
  const { data: people } = await supabase.from("members").select("id,email").eq("org_id", org.id);
  const byEmail = new Map((people ?? []).map((p) => [p.email.toLowerCase(), p.id]));
  const problems: string[] = [];
  const out = rows.map(([email = "", start = "", birthday = ""], i) => {
    const id = byEmail.get(email.trim().toLowerCase());
    const row: Record<string, string | number | null> = { member_id: id ?? null };
    if (!id) problems.push(`Row ${i + 1}: no one with ${email.trim() || "that email"}`);
    const s = start.trim();
    if (s) {
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : (/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)?.slice(1) ?? []).length === 3
        ? (() => { const [d, m, y] = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)!.slice(1); return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`; })() : null;
      if (!iso || Number.isNaN(Date.parse(iso))) problems.push(`Row ${i + 1}: start date “${s}” should look like 2021-03-01 or 01/03/2021`); else row.start_date = iso;
    }
    const b = /^(\d{1,2})\/(\d{1,2})$/.exec(birthday.trim());
    if (birthday.trim() && !b) problems.push(`Row ${i + 1}: birthday “${birthday.trim()}” should look like 14/03 (day/month)`);
    if (b) { row.birth_day = Number(b[1]); row.birth_month = Number(b[2]); }
    return row;
  });
  if (problems.length) back(S, { error: problems.slice(0, 6).join(" · ") + (problems.length > 6 ? ` · and ${problems.length - 6} more` : "") });
  const { data: n, error } = await supabase.rpc("admin_set_staff_details", { p_rows: out });
  if (error) back(S, { error: friendly(error, "admin/staff-details") });
  back(S, { msg: `Details saved for ${n} ${n === 1 ? "person" : "people"}.` });
}
