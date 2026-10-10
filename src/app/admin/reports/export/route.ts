import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadDeviceInfo, loadReport, shiftDate } from "@/lib/reports";
import { todayIn, type Org } from "@/lib/session";
import { FLAG_LABELS } from "@/lib/constants";
import { csvRow } from "@/lib/csv";

function validDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { data: me } = await supabase.from("members").select("id,org_id,status,role").eq("user_id", user.id).maybeSingle();
  if (!me || me.status !== "active" || !["owner", "admin", "manager"].includes(me.role)) return new NextResponse("Forbidden", { status: 403 });
  const [{ data: org }, { data: sub }] = await Promise.all([
    supabase.from("organizations").select("id,name,domain,timezone,work_start,work_end,grace_minutes,home_radius_m").eq("id", me.org_id).single<Org>(),
    supabase.from("subscriptions").select("plan").eq("org_id", me.org_id).maybeSingle(),
  ]);
  if (!org) return new NextResponse("Organization not found", { status: 404 });

  const url = new URL(request.url);
  const today = todayIn(org.timezone);
  let from = validDate(url.searchParams.get("from")) ?? shiftDate(today, -6);
  const to = validDate(url.searchParams.get("to")) ?? today;
  if (from > to) return new NextResponse("The start date must be on or before the end date.", { status: 400 });
  if (sub?.plan === "basic" && from < shiftDate(today, -30)) from = shiftDate(today, -30);

  try {
    const { events, people, locName } = await loadReport(supabase, me.org_id, from, to);
    const time = new Intl.DateTimeFormat("en-GB", { timeZone: org.timezone, hour: "2-digit", minute: "2-digit", hour12: true });
    // Network/device details are personal data: admins only, never managers.
    const isAdmin = me.role === "owner" || me.role === "admin";
    const device = isAdmin ? await loadDeviceInfo(supabase, from, to) : null;
    const header = ["Date", "Time", "Name", "Email", "Team", "Action", "Where", "Expected", "Distance (m)", "GPS accuracy (m)", "Flags", ...(device ? ["IP", "Device"] : [])];
    const lines = [csvRow(header)];
    for (const event of events) {
      const person = people.get(event.member_id);
      lines.push(csvRow([
        event.local_date,
        time.format(new Date(event.at)),
        person?.full_name,
        person?.email,
        person?.team,
        event.kind === "in" ? "Check in" : "Check out",
        event.location_type === "office" ? locName.get(event.location_id ?? "") ?? "Office" : event.location_type === "home" ? "Home" : "Outside",
        event.expected_mode,
        event.distance_m != null ? Math.round(event.distance_m) : "",
        event.accuracy_m != null ? Math.round(event.accuracy_m) : "",
        event.flags.map((flag) => FLAG_LABELS[flag] ?? flag).join("; "),
        ...(device ? [device.get(event.id)?.ip ?? "", device.get(event.id)?.user_agent ?? ""] : []),
      ]));
    }

    return new NextResponse("\uFEFF" + lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="5ime-attendance-${from}-to-${to}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return new NextResponse(error instanceof Error ? error.message : "Could not build a complete report.", { status: 422 });
  }
}
