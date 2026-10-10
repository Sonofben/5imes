import Link from "next/link";
import { requireMember, todayIn, timeIn, isoWeekdayIn, expectedMode } from "@/lib/session";
import { Logo } from "@/components/Logo";
import { CheckInPanel } from "./CheckInPanel";
import { HomeLocationPanel } from "./HomeLocationPanel";
import { FLAG_LABELS, WEEKDAYS } from "@/lib/constants";

export const dynamic = "force-dynamic";

type LatestAttendance = { member_id: string; kind: "in" | "out"; at: string; local_date: string };

export default async function StaffApp() {
  const { supabase, me, org, isViewer } = await requireMember();
  const today = todayIn(org.timezone);
  const weekday = isoWeekdayIn(org.timezone);

  const [{ data: schedules }, { data: events }, { data: latestEvent }] = await Promise.all([
    supabase.from("schedules").select("member_id,weekday,mode").eq("org_id", org.id),
    supabase.from("attendance").select("id,kind,at,location_type,flags,distance_m").eq("member_id", me.id).eq("local_date", today).order("at", { ascending: true }),
    supabase.from("member_latest_attendance").select("member_id,kind,at,local_date").eq("member_id", me.id).maybeSingle<LatestAttendance>(),
  ]);

  const expected = expectedMode(schedules ?? [], me.id, weekday);
  const openSession = latestEvent?.kind === "in" ? latestEvent : null;
  const currentEvents = events ?? [];
  const week = WEEKDAYS.map((d, i) => ({ d, mode: expectedMode(schedules ?? [], me.id, i + 1) }));
  const sessionLabel = openSession
    ? openSession.local_date === today
      ? `Started today at ${timeIn(openSession.at, org.timezone)}`
      : `Started ${openSession.local_date} at ${timeIn(openSession.at, org.timezone)}`
    : null;

  return (
    <main className="mx-auto max-w-lg px-4 pb-12 sm:px-6">
      <header className="flex items-center justify-between gap-3 border-b border-line py-4">
        <Logo href="/app" />
        <div className="flex items-center gap-2">
          {isViewer && <Link href="/admin" className="btn-ghost btn-sm">Admin</Link>}
          <form action="/auth/signout" method="post"><button className="btn-ghost btn-sm">Sign out</button></form>
        </div>
      </header>

      <section className="py-7">
        <p className="eyebrow">{org.name}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Good {greeting()}, {me.full_name?.split(" ")[0] || me.email.split("@")[0]}</h1>
        <p className="mt-1 text-sm text-muted">{new Intl.DateTimeFormat("en-NG", { timeZone: org.timezone, weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p>
      </section>

      <section aria-label="Attendance check-in" className="card mb-4 p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div><p className="eyebrow">Your workday</p><h2 className="mt-1 font-bold">{openSession ? "You’re currently checked in" : "Ready to check in?"}</h2></div>
          <span className={`chip shrink-0 ${expected === "off" ? "bg-paper text-muted" : expected === "home" ? "bg-brand/10 text-brand-dark" : "bg-ink/5 text-ink"}`}>{expected === "off" ? "Non-working day" : `Expected: ${expected}`}</span>
        </div>
        <CheckInPanel checkedIn={!!openSession} expected={expected} sessionLabel={sessionLabel} />
      </section>

      <section className="card mb-4">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-bold">Today’s activity</h2><span className="text-xs text-muted">{currentEvents.length} event{currentEvents.length === 1 ? "" : "s"}</span></div>
        {currentEvents.length > 0 ? <ol className="space-y-0">{currentEvents.map((event, index) => <li key={event.id} className="relative flex items-start gap-3 pb-4 last:pb-0">
          <div className="flex w-4 shrink-0 flex-col items-center"><span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${event.kind === "in" ? "bg-ok" : "bg-ink/35"}`} />{index < currentEvents.length - 1 && <span className="mt-1 min-h-7 w-px flex-1 bg-line" />}</div>
          <div className="flex min-w-0 flex-1 items-start justify-between gap-3 text-sm">
            <div><b>{event.kind === "in" ? "Checked in" : "Checked out"}</b><span className="text-muted"> · {event.location_type === "none" ? event.flags.includes("corrected") ? "time correction (no GPS supplied)" : "outside approved locations" : event.location_type}</span>{event.flags.length > 0 && <div className="mt-1 text-xs text-warn">{event.flags.map((f: string) => FLAG_LABELS[f] ?? f).join(" · ")}</div>}</div>
            <time className="shrink-0 tabular-nums text-muted">{timeIn(event.at, org.timezone)}</time>
          </div>
        </li>)}</ol> : <p className="text-sm text-muted">No attendance events today.</p>}
        {openSession && openSession.local_date !== today && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-warn">Your open session began on {openSession.local_date}; check out here when your shift ends.</p>}
      </section>

      <section className="card mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-bold">Need to correct an attendance time?</h2><p className="mt-1 text-sm text-muted">Send a request for your manager to review. Your recorded times change only if it is approved.</p></div>
        <Link href="/app/corrections" className="btn-ghost">Request correction</Link>
      </section>

      <section className="card mb-4">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-bold">This week</h2><span className="text-xs text-muted">Your schedule</span></div>
        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] sm:gap-2 sm:text-xs">
          {week.map((day, i) => <div key={day.d} aria-current={i + 1 === weekday ? "date" : undefined} className={`rounded-xl px-1 py-2 ${i + 1 === weekday ? "ring-2 ring-brand ring-offset-1" : ""} ${day.mode === "office" ? "bg-ink text-white" : day.mode === "home" ? "bg-brand/10 text-brand-dark" : "bg-paper text-muted"}`}>
            <div className="font-semibold">{day.d}</div><div className="mt-1 capitalize opacity-80">{day.mode}</div>
          </div>)}
        </div>
      </section>

      <HomeLocationPanel status={me.home_status} hasApproved={me.home_lat !== null} hasPending={me.home_req_lat !== null} />
      <p className="mt-5 text-center text-xs leading-5 text-muted">Check in only at a manager-approved office or your approved home on days scheduled for that place. This is not unrestricted “work from anywhere” tracking.</p>
    </main>
  );
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}
