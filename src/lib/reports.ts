import type { SupabaseClient } from "@supabase/supabase-js";

export type ReportEvent = {
  id: string;
  member_id: string;
  kind: "in" | "out";
  at: string;
  local_date: string;
  location_type: string;
  location_id: string | null;
  distance_m: number | null;
  accuracy_m: number | null;
  expected_mode: string | null;
  flags: string[];
};

export function shiftDate(date: string, days: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export class ReportQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportQueryError";
  }
}

export async function loadReport(supabase: SupabaseClient, orgId: string, from: string, to: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    throw new ReportQueryError("Choose a valid report date range.");
  }
  const [membersResult, locationsResult] = await Promise.all([
    supabase.from("members").select("id, full_name, email, team").eq("org_id", orgId),
    supabase.from("locations").select("id, name").eq("org_id", orgId),
  ]);
  if (membersResult.error) throw new ReportQueryError(`Could not load the staff list: ${membersResult.error.message}`);
  if (locationsResult.error) throw new ReportQueryError(`Could not load office locations: ${locationsResult.error.message}`);

  // Include one prior company-local day so a night shift checked in before `from` can
  // be paired with its check-out inside the selected report window.
  const scanFrom = shiftDate(from, -1);
  const scanned: ReportEvent[] = [];
  const pageSize = 1000;
  const maxPages = 100; // Full export up to 100,000 events; fail clearly beyond this cap.
  let complete = false;
  for (let page = 0; page < maxPages; page++) {
    const result = await supabase
      .from("attendance")
      .select("id,member_id,kind,at,local_date,location_type,location_id,distance_m,accuracy_m,expected_mode,flags")
      .eq("org_id", orgId)
      .gte("local_date", scanFrom)
      .lte("local_date", to)
      .order("at", { ascending: true })
      .order("id", { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (result.error) throw new ReportQueryError(`Attendance report query failed: ${result.error.message}`);
    const pageEvents = (result.data ?? []) as ReportEvent[];
    scanned.push(...pageEvents);
    if (pageEvents.length < pageSize) {
      complete = true;
      break;
    }
  }
  if (!complete) throw new ReportQueryError("This range contains more than 100,000 events. Narrow the date range; no partial report was returned.");

  const events = scanned.filter((event) => event.local_date >= from && event.local_date <= to);
  const locName = new Map((locationsResult.data ?? []).map((location) => [location.id as string, location.name as string]));
  const people = new Map((membersResult.data ?? []).map((member) => [member.id as string, member as { id: string; full_name: string | null; email: string; team: string | null }]));

  const perMember = new Map<string, ReportEvent[]>();
  for (const event of scanned) perMember.set(event.member_id, [...(perMember.get(event.member_id) ?? []), event]);

  const daily = new Map<string, { firstIn?: ReportEvent; late: boolean; flagged: boolean; present: boolean }>();
  for (const event of events) {
    const key = `${event.member_id}|${event.local_date}`;
    const day = daily.get(key) ?? { late: false, flagged: false, present: false };
    if (event.kind === "in") {
      day.present = true;
      if (!day.firstIn) day.firstIn = event;
    }
    if (event.flags.includes("late")) day.late = true;
    if (event.flags.some((flag) => flag !== "late")) day.flagged = true;
    daily.set(key, day);
  }

  const summary = new Map<string, { daysPresent: number; office: number; home: number; late: number; flagged: number; minutes: number }>();
  for (const [key, day] of daily) {
    if (!day.present) continue;
    const memberId = key.slice(0, key.indexOf("|"));
    const summaryRow = summary.get(memberId) ?? { daysPresent: 0, office: 0, home: 0, late: 0, flagged: 0, minutes: 0 };
    summaryRow.daysPresent++;
    if (day.firstIn?.location_type === "office") summaryRow.office++;
    else if (day.firstIn?.location_type === "home") summaryRow.home++;
    if (day.late) summaryRow.late++;
    if (day.flagged) summaryRow.flagged++;
    summary.set(memberId, summaryRow);
  }

  // Pair in/out chronologically per person, not per local date. That preserves
  // overnight shift hours and prevents the midnight boundary from dropping time.
  for (const [memberId, memberEvents] of perMember) {
    let openAt: number | null = null;
    let minutes = 0;
    for (const event of memberEvents) {
      const at = new Date(event.at).getTime();
      if (event.kind === "in") openAt = at;
      else if (openAt !== null && at >= openAt) {
        minutes += (at - openAt) / 60000;
        openAt = null;
      }
    }
    const summaryRow = summary.get(memberId);
    if (summaryRow) summaryRow.minutes = minutes;
  }

  return { events, people, locName, summary };
}

export function hours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}


/** IP + device details for admins only (the database refuses managers). Paginated like loadReport. */
export async function loadDeviceInfo(supabase: SupabaseClient, from: string, to: string) {
  const info = new Map<string, { ip: string | null; user_agent: string | null }>();
  const pageSize = 1000;
  for (let page = 0; page < 100; page++) {
    const result = await supabase
      .rpc("attendance_device_info", { p_from: shiftDate(from, -1), p_to: to })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (result.error) throw new ReportQueryError(`Device details query failed: ${result.error.message}`);
    const rows = (result.data ?? []) as { attendance_id: string; ip: string | null; user_agent: string | null }[];
    for (const row of rows) info.set(row.attendance_id, { ip: row.ip, user_agent: row.user_agent });
    if (rows.length < pageSize) return info;
  }
  throw new ReportQueryError("Too many events for the device-details export. Narrow the date range.");
}
