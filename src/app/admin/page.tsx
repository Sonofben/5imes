import Link from "next/link";
import { requireMember, todayIn, timeIn, isoWeekdayIn, expectedMode, type Member } from "@/lib/session";
import { AutoRefresh } from "@/components/AutoRefresh";
import { FLAG_LABELS } from "@/lib/constants";
import { shiftDate } from "@/lib/reports";
import { AttendanceAlerts } from "./AttendanceAlerts";

export const dynamic = "force-dynamic";

type Event = { member_id: string; kind: "in" | "out"; at: string; local_date: string; location_type: string; location_id: string | null; flags: string[] };
type Latest = Event;

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const { supabase, org } = await requireMember({ viewer: true });
  const today = todayIn(org.timezone);
  const weekday = isoWeekdayIn(org.timezone);
  const [{ data: members }, { data: events }, { data: schedules }, { data: locations }, { data: latestEvents }, { data: alertEvents }] = await Promise.all([
    supabase.from("members").select("id,full_name,email,team,status").eq("org_id", org.id).eq("status", "active").order("full_name"),
    supabase.from("attendance").select("member_id,kind,at,local_date,location_type,location_id,flags").eq("org_id", org.id).eq("local_date", today).order("at"),
    supabase.from("schedules").select("member_id,weekday,mode").eq("org_id", org.id),
    supabase.from("locations").select("id,name").eq("org_id", org.id),
    supabase.from("member_latest_attendance").select("member_id,kind,at,local_date,location_type,location_id,flags,expected_mode").eq("org_id", org.id),
    supabase.from("attendance").select("member_id,kind,at,local_date,flags").eq("org_id", org.id).gte("local_date", shiftDate(today, -1)).lte("local_date", today).order("at"),
  ]);

  const locName = new Map((locations ?? []).map((location) => [location.id, location.name]));
  const latestByMember = new Map(((latestEvents ?? []) as Latest[]).map((event) => [event.member_id, event]));
  const eventsByMember = new Map<string, Event[]>();
  for (const event of (events ?? []) as Event[]) eventsByMember.set(event.member_id, [...(eventsByMember.get(event.member_id) ?? []), event]);
  const rows = ((members ?? []) as Pick<Member, "id" | "full_name" | "email" | "team">[]).map((member) => {
    const todayEvents = eventsByMember.get(member.id) ?? [];
    const first = todayEvents.find((event) => event.kind === "in");
    const lastOut = [...todayEvents].reverse().find((event) => event.kind === "out");
    const latest = latestByMember.get(member.id);
    const flags = [...new Set(todayEvents.flatMap((event) => event.flags))];
    const expected = expectedMode(schedules ?? [], member.id, weekday);
    return { member, todayEvents, first, lastOut, latest, flags, expected, inNow: latest?.kind === "in" };
  });

  const working = rows.filter((row) => row.expected !== "off");
  const stats = [
    { label: "Checked in now", value: rows.filter((row) => row.inNow).length, tone: "text-ink" },
    { label: "At an office", value: rows.filter((row) => row.inNow && row.latest?.location_type === "office").length, tone: "text-ink" },
    { label: "Working from home", value: rows.filter((row) => row.inNow && row.latest?.location_type === "home").length, tone: "text-ink" },
    { label: "Not in yet", value: working.filter((row) => !row.first && !row.inNow).length, tone: "text-warn" },
    { label: "Needs attention", value: rows.filter((row) => row.flags.length > 0).length, tone: "text-brand" },
  ];
  const q = (sp.q ?? "").trim().toLowerCase();
  const visibleRows = rows.filter(({ member }) => !q || [member.full_name, member.email, member.team].some((value) => value?.toLowerCase().includes(q)));
  const orderedRows = [...visibleRows].sort((a, b) => Number(b.flags.length > 0) - Number(a.flags.length > 0) || Number(b.inNow) - Number(a.inNow) || (a.member.full_name || a.member.email).localeCompare(b.member.full_name || b.member.email));
  const dateLabel = new Intl.DateTimeFormat("en-NG", { timeZone: org.timezone, weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const now = new Date();

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={60} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="eyebrow">Workforce overview</p><h1 className="page-heading">Today</h1><p className="page-description">{dateLabel} · live attendance for {org.name}</p></div>
        <Link href={`/admin/reports?from=${today}&to=${today}`} className="btn-ghost">View today’s report</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">{stats.map((stat) => <article key={stat.label} className="card p-4 sm:p-5">
        <p className="eyebrow">{stat.label}</p><p className={`mt-2 text-3xl font-bold tabular-nums tracking-tight ${stat.tone}`}>{stat.value}</p>
      </article>)}</div>

      <AttendanceAlerts
        members={(members ?? []) as Pick<Member, "id" | "full_name" | "email" | "team">[]}
        schedules={schedules ?? []}
        events={(alertEvents ?? []) as { member_id: string; kind: "in" | "out"; at: string; local_date: string; flags: string[] }[]}
        latest={(latestEvents ?? []) as { member_id: string; kind: "in" | "out" }[]}
        timezone={org.timezone}
        workStart={org.work_start}
        workEnd={org.work_end}
        graceMinutes={org.grace_minutes}
        now={now}
      />

      {rows.length <= 1 && <div className="card border-dashed bg-[#fafbf9] text-sm leading-6"><b>Set up your workspace.</b> Add an office in <Link className="font-semibold underline underline-offset-2" href="/admin/locations">Locations</Link>, then invite your team from <Link className="font-semibold underline underline-offset-2" href="/admin/staff">People</Link>.</div>}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-lg font-bold">Attendance status</h2><p className="mt-1 text-xs text-muted">A check-in that remains open after midnight is still shown as active.</p></div>
          <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-ok" /><span className="text-xs text-muted">Refreshes every minute · checked {new Intl.DateTimeFormat("en-NG", { timeZone: org.timezone, hour: "numeric", minute: "2-digit" }).format(now)}</span></div>
        </div>
        <form className="flex flex-wrap gap-2" role="search"><label className="sr-only" htmlFor="staff-search">Search people</label><input id="staff-search" name="q" defaultValue={sp.q} className="input max-w-sm" placeholder="Search name, email or team"/><button className="btn-ghost">Search</button>{q && <Link href="/admin" className="btn-ghost">Clear</Link>}</form>

        <div className="hidden overflow-hidden rounded-2xl border border-line bg-white shadow-sm md:block">
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>Person</th><th>Schedule</th><th>Current status</th><th>First in today</th><th>Last out today</th><th>Exceptions</th></tr></thead>
            <tbody>{orderedRows.map(({ member, first, lastOut, latest, flags, expected, inNow }) => <tr key={member.id}>
              <td><div className="font-semibold">{member.full_name || member.email}</div><div className="text-xs text-muted">{member.team || member.email}</div></td>
              <td className="capitalize">{expected}</td>
              <td>{inNow ? <span className="chip bg-green-50 text-ok">In · {latest?.location_type === "office" ? locName.get(latest.location_id ?? "") ?? "Office" : latest?.location_type === "home" ? "Home" : "Location pending"}</span> : first ? <span className="chip bg-paper text-muted">Checked out</span> : expected === "off" ? <span className="chip bg-paper text-muted">Day off</span> : <span className="chip bg-amber-50 text-warn">Not in</span>}{inNow && latest && latest.local_date !== today && <div className="mt-1 text-xs text-muted">Since {latest.local_date} · {timeIn(latest.at,org.timezone)}</div>}</td>
              <td className="tabular-nums">{first ? timeIn(first.at,org.timezone) : inNow && latest?.local_date !== today ? "Overnight" : "—"}</td>
              <td className="tabular-nums">{lastOut ? timeIn(lastOut.at,org.timezone) : "—"}</td>
              <td className="text-xs text-warn">{flags.map((flag) => FLAG_LABELS[flag] ?? flag).join(" · ") || "—"}</td>
            </tr>)}</tbody>
          </table></div>
          {orderedRows.length === 0 && <p className="p-6 text-sm text-muted">No people match “{sp.q}”.</p>}
        </div>

        <ul className="space-y-3 md:hidden">{orderedRows.map(({ member, first, lastOut, latest, flags, expected, inNow }) => <li key={member.id} className="card space-y-3 p-4">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{member.full_name || member.email}</p><p className="truncate text-xs text-muted">{member.team || member.email}</p></div>{inNow ? <span className="chip shrink-0 bg-green-50 text-ok">In · {latest?.location_type === "office" ? locName.get(latest.location_id ?? "") ?? "Office" : latest?.location_type === "home" ? "Home" : "Location pending"}</span> : first ? <span className="chip shrink-0 bg-paper text-muted">Checked out</span> : expected === "off" ? <span className="chip shrink-0 bg-paper text-muted">Day off</span> : <span className="chip shrink-0 bg-amber-50 text-warn">Not in</span>}</div>
          <div className="grid grid-cols-2 gap-3 border-t border-line pt-3 text-xs"><div><p className="eyebrow">Schedule</p><p className="mt-1 capitalize">{expected}</p></div><div><p className="eyebrow">First in</p><p className="mt-1 tabular-nums">{first ? timeIn(first.at,org.timezone) : inNow && latest?.local_date !== today ? `Overnight · ${latest ? timeIn(latest.at,org.timezone) : ""}` : "—"}</p></div><div><p className="eyebrow">Last out</p><p className="mt-1 tabular-nums">{lastOut ? timeIn(lastOut.at,org.timezone) : "—"}</p></div><div><p className="eyebrow">Exceptions</p><p className={`mt-1 ${flags.length ? "text-warn" : "text-muted"}`}>{flags.map((flag) => FLAG_LABELS[flag] ?? flag).join(" · ") || "None"}</p></div></div>
        </li>)}</ul>
      </section>
    </div>
  );
}
