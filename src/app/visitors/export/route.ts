import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { csvRow } from "@/lib/csv";
import { statusFor } from "@/lib/throttle";
import { reasonLabel, zonedIso } from "@/lib/visitors";
import { friendly } from "@/lib/errors";

/** Visitor log as CSV for admins and managers (same filters as the Visitor log page). Each download is recorded in the audit trail. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { data: me } = await supabase.from("members").select("org_id,role,status").eq("user_id", user.id).maybeSingle();
  if (!me || me.status !== "active" || !["owner", "admin", "manager"].includes(me.role)) return new NextResponse("Forbidden", { status: 403 });
  const { data: org } = await supabase.from("organizations").select("timezone,domain").eq("id", me.org_id).single();
  const tz = org?.timezone ?? "Africa/Lagos";
  const sp = new URL(request.url).searchParams;
  const valid = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  const to = valid(sp.get("to")) ?? new Date().toISOString().slice(0, 10);
  const from = valid(sp.get("from")) ?? to;
  const q = (sp.get("q") ?? "").trim().slice(0, 60).replace(/[%,()"\\*]/g, "");
  // Rate-limited (30 an hour per person) and recorded in the visitor audit trail by the database.
  const { error: auditError } = await supabase.rpc("vms_log_export", { p_from: from, p_to: to });
  if (auditError) return new NextResponse(friendly(auditError, "visitors/export"), { status: statusFor(auditError) });
  let query = supabase.from("visits")
    .select("visitor_name,visitor_company,visitor_email,visitor_phone,purpose,reason,host_member_id,host_hint,location_id,status,walk_in,expected_at,arrived_at,signed_in_at,signed_out_at,created_at")
    .eq("org_id", me.org_id).gte("created_at", zonedIso(from, "00:00", tz)!)
    .lt("created_at", new Date(new Date(zonedIso(to, "00:00", tz)!).getTime() + 86400000).toISOString())
    .order("created_at").limit(10000);
  if (q) query = query.or(`visitor_name.ilike.%${q}%,visitor_company.ilike.%${q}%`);
  const [{ data: rows, error }, { data: people }, { data: locations }] = await Promise.all([
    query,
    supabase.from("members").select("id,full_name,email").eq("org_id", me.org_id),
    supabase.from("locations").select("id,name").eq("org_id", me.org_id),
  ]);
  if (error) return new NextResponse(friendly(error, "visitors/export"), { status: 500 });
  const host = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email]));
  const office = new Map((locations ?? []).map((l) => [l.id, l.name]));
  const t = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-GB", { timeZone: tz, dateStyle: "short", timeStyle: "short" }).format(new Date(iso)) : "");
  const lines = [csvRow(["Visitor", "Company", "Email", "Phone", "Reason", "Purpose", "Host", "Office", "Status", "Walk-in", "Expected", "Arrived", "Signed in", "Signed out"])];
  for (const v of rows ?? []) lines.push(csvRow([v.visitor_name, v.visitor_company ?? "", v.visitor_email ?? "", v.visitor_phone ?? "", v.walk_in ? reasonLabel(v.reason) : "Invited", v.purpose ?? "",
    host.get(v.host_member_id ?? "") ?? (v.host_hint ? `(asked for ${v.host_hint})` : ""), office.get(v.location_id ?? "") ?? "", v.status, v.walk_in ? "yes" : "no",
    t(v.expected_at), t(v.arrived_at), t(v.signed_in_at), t(v.signed_out_at)]));
  return new NextResponse("\uFEFF" + lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="5ime-visitors-${from}-to-${to}.csv"`, "Cache-Control": "no-store" },
  });
}
