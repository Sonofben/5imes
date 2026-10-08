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
  ip: string | null;
  user_agent: string | null;
};

export function shiftDate(date: string, days: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function loadReport(supabase: SupabaseClient, orgId: string, from: string, to: string) {
  const [{ data: members }, { data: locations }] = await Promise.all([
    supabase.from("members").select("id, full_name, email, team").eq("org_id", orgId),
    supabase.from("locations").select("id, name").eq("org_id", orgId),
  ]);

  const events: ReportEvent[] = [];
  for (let page = 0; page < 50; page++) {
    const { data } = await supabase
      .from("attendance")
      .select("*")
      .eq("org_id", orgId)
      .gte("local_date", from)
      .lte("local_date", to)
      .order("at")
      .range(page * 1000, page * 1000 + 999);
    events.push(...((data ?? []) as ReportEvent[]));
    if (!data || data.length < 1000) break;
  }

  const locName = new Map((locations ?? []).map((l) => [l.id as string, l.name as string]));
  const people = new Map((members ?? []).map((m) => [m.id as string, m as { id: string; full_name: string | null; email: string; team: string | null }]));

  // per person per day
  const days = new Map<string, ReportEvent[]>();
  for (const e of events) {
    const k = `${e.member_id}|${e.local_date}`;
    days.set(k, [...(days.get(k) ?? []), e]);
  }

  const summary = new Map<
    string,
    { daysPresent: number; office: number; home: number; late: number; flagged: number; minutes: number }
  >();
  for (const [k, list] of days) {
    const memberId = k.split("|")[0];
    const s = summary.get(memberId) ?? { daysPresent: 0, office: 0, home: 0, late: 0, flagged: 0, minutes: 0 };
    s.daysPresent++;
    const firstIn = list.find((e) => e.kind === "in");
    if (firstIn?.location_type === "office") s.office++;
    else if (firstIn?.location_type === "home") s.home++;
    if (list.some((e) => e.flags.includes("late"))) s.late++;
    if (list.some((e) => e.flags.some((f) => f !== "late"))) s.flagged++;
    let open: string | null = null;
    for (const e of list) {
      if (e.kind === "in") open = e.at;
      else if (open) {
        s.minutes += (new Date(e.at).getTime() - new Date(open).getTime()) / 60000;
        open = null;
      }
    }
    summary.set(memberId, s);
  }

  return { events, people, locName, summary };
}

export function hours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}
