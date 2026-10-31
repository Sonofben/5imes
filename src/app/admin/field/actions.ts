"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { flashQuery } from "@/lib/flash";
import { friendly } from "@/lib/errors";
import { parseCsv } from "@/lib/csv";
import { uuid } from "@/lib/schemas";

function back(path: string, q: Record<string, string>): never {
  revalidatePath("/admin/field", "layout");
  redirect(`${path}?${flashQuery(q)}`);
}

export async function planVisit(f: FormData) {
  const { supabase } = await requireMember({ viewer: true });
  const members = f.getAll("member").map(String).filter((m) => uuid.safeParse(m).success);
  const site = String(f.get("site") ?? ""), date = String(f.get("date") ?? ""), note = String(f.get("note") ?? "");
  if (!members.length) back("/admin/field", { error: "Choose who should visit." });
  for (const m of members) {
    const { error } = await supabase.rpc("plan_visit", { p_member: m, p_site: site, p_date: date, p_note: note });
    if (error) back("/admin/field", { error: friendly(error, "field/plan") });
  }
  back("/admin/field", { msg: members.length === 1 ? "Visit planned." : `${members.length} visits planned.` });
}

export async function cancelVisit(id: string) {
  const { supabase } = await requireMember({ viewer: true });
  const { error } = await supabase.rpc("cancel_visit", { p_id: id });
  if (error) back("/admin/field", { error: friendly(error, "field/cancel") });
  back("/admin/field", { msg: "Visit cancelled." });
}

export async function setField(member: string, on: boolean) {
  const { supabase } = await requireMember({ admin: true });
  const { error } = await supabase.rpc("admin_set_field", { p_member: member, p_on: on });
  if (error) back("/admin/field/sites", { error: friendly(error, "field/staff") });
  back("/admin/field/sites", { msg: on ? "Marked as field staff." : "No longer field staff." });
}

const num = (v: unknown) => { const x = Number(String(v ?? "").trim()); return String(v ?? "").trim() === "" || !Number.isFinite(x) ? null : x; };

export async function saveSite(id: string | null, f: FormData) {
  const { supabase } = await requireMember({ viewer: true });
  const row = { id: id ?? undefined, name: String(f.get("name") ?? ""), address: String(f.get("address") ?? ""), lat: num(f.get("lat")), lng: num(f.get("lng")),
    radius_m: num(f.get("radius")) ?? 150, contact_name: String(f.get("contact_name") ?? ""), contact_phone: String(f.get("contact_phone") ?? ""), active: f.get("active") !== "off" };
  if (row.lat === null || row.lng === null) back("/admin/field/sites", { error: "Add the site’s map pin: latitude and longitude (from Google Maps: right-click the place)." });
  const { error } = await supabase.rpc("admin_save_sites", { p_rows: [row] });
  if (error) back("/admin/field/sites", { error: friendly(error, "field/site") });
  back("/admin/field/sites", { msg: id ? "Site saved." : "Site added." });
}

/** Spreadsheet: name, address, latitude, longitude, area in metres (optional), contact name, contact phone. */
export async function importSites(f: FormData) {
  const { supabase } = await requireMember({ viewer: true });
  let rows: string[][];
  try { rows = parseCsv(String(f.get("csv") ?? "")); } catch (e) { back("/admin/field/sites", { error: friendly(e, "field/import", "Could not read the list.") }); }
  if (rows.length && rows[0][0]?.trim().toLowerCase() === "name") rows.shift();
  if (!rows.length) back("/admin/field/sites", { error: "Paste at least one site." });
  const problems: string[] = [];
  const out = rows.map(([name = "", address = "", lat = "", lng = "", radius = "", cn = "", cp = ""], i) => {
    if (!name.trim() || num(lat) === null || num(lng) === null) problems.push(`Row ${i + 1}: needs a name, latitude and longitude`);
    return { name, address, lat: num(lat), lng: num(lng), radius_m: num(radius) ?? 150, contact_name: cn, contact_phone: cp };
  });
  if (problems.length) back("/admin/field/sites", { error: problems.slice(0, 6).join(" · ") });
  const { data: n, error } = await supabase.rpc("admin_save_sites", { p_rows: out });
  if (error) back("/admin/field/sites", { error: friendly(error, "field/import") });
  back("/admin/field/sites", { msg: `${n} sites added.` });
}
