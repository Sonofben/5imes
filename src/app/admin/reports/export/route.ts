import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadReport, shiftDate } from "@/lib/reports";
import { todayIn, type Member, type Org } from "@/lib/session";
import { FLAG_LABELS } from "@/lib/constants";

function csv(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { data: me } = await supabase.from("members").select("*").eq("user_id", user.id).maybeSingle<Member>();
  if (!me || me.status !== "active" || me.role === "staff") return new NextResponse("Forbidden", { status: 403 });
  const { data: org } = await supabase.from("organizations").select("*").eq("id", me.org_id).single<Org>();
  const { data: sub } = await supabase.from("subscriptions").select("plan").eq("org_id", me.org_id).maybeSingle();

  const url = new URL(request.url);
  const today = todayIn(org!.timezone);
  const valid = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  let from = valid(url.searchParams.get("from")) ?? shiftDate(today, -6);
  const to = valid(url.searchParams.get("to")) ?? today;
  if (sub?.plan === "basic" && from < shiftDate(today, -30)) from = shiftDate(today, -30);

  const { events, people, locName } = await loadReport(supabase, me.org_id, from, to);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: org!.timezone, hour: "2-digit", minute: "2-digit" });

  const header = ["Date", "Time", "Name", "Email", "Team", "Action", "Where", "Expected", "Distance (m)", "GPS accuracy (m)", "Flags", "IP", "Device"];
  const lines = [header.join(",")];
  for (const e of events) {
    const p = people.get(e.member_id);
    lines.push(
      [
        e.local_date,
        time.format(new Date(e.at)),
        p?.full_name,
        p?.email,
        p?.team,
        e.kind === "in" ? "Check in" : "Check out",
        e.location_type === "office" ? locName.get(e.location_id ?? "") ?? "Office" : e.location_type === "home" ? "Home" : "Outside",
        e.expected_mode,
        e.distance_m != null ? Math.round(e.distance_m) : "",
        e.accuracy_m != null ? Math.round(e.accuracy_m) : "",
        e.flags.map((f) => FLAG_LABELS[f] ?? f).join("; "),
        e.ip,
        e.user_agent,
      ]
        .map(csv)
        .join(",")
    );
  }

  return new NextResponse("﻿" + lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="5ime-attendance-${from}-to-${to}.csv"`,
    },
  });
}
