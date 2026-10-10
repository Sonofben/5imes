import Link from "next/link";
import { afterShiftEndGrace, attendanceAlertWorkDate, isoWeekdayForDate, localClockMinutes, timeLabel } from "@/lib/attendance";
import { expectedMode, type Member } from "@/lib/session";

type AlertEvent = { member_id: string; kind: "in" | "out"; at: string; local_date: string; flags: string[] };
type LatestEvent = { member_id: string; kind: "in" | "out" };
type Alert = { kind: "late" | "absent"; member: Pick<Member, "id" | "full_name" | "email" | "team">; at?: string; workDate: string };

export function AttendanceAlerts({
  members,
  schedules,
  events,
  latest,
  timezone,
  workStart,
  workEnd,
  graceMinutes,
  now,
}: {
  members: Pick<Member, "id" | "full_name" | "email" | "team">[];
  schedules: { member_id: string | null; weekday: number; mode: string }[];
  events: AlertEvent[];
  latest: LatestEvent[];
  timezone: string;
  workStart: string;
  workEnd: string;
  graceMinutes: number;
  now: Date;
}) {
  const shiftDate = attendanceAlertWorkDate(now, timezone, workStart, workEnd);
  const weekday = isoWeekdayForDate(shiftDate);
  const localToday = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const endMinute = Number(workEnd.slice(0, 2)) * 60 + Number(workEnd.slice(3, 5));
  const overnight = workEnd.slice(0, 5) <= workStart.slice(0, 5);
  const shiftEvents = events.filter((event) => event.local_date === shiftDate || (
    overnight && shiftDate < localToday && event.local_date === localToday && event.kind === "in"
    && localClockMinutes(new Date(event.at), timezone) < endMinute
  ));
  const inNow = new Set(latest.filter((event) => event.kind === "in").map((event) => event.member_id));
  const alerts: Alert[] = [];

  for (const member of members) {
    const expected = expectedMode(schedules, member.id, weekday);
    const personEvents = shiftEvents.filter((event) => event.member_id === member.id);
    const lateEvent = personEvents.find((event) => event.kind === "in" && event.flags.includes("late"));
    if (lateEvent) alerts.push({ kind: "late", member, at: lateEvent.at, workDate: shiftDate });
    if (expected !== "off" && !personEvents.some((event) => event.kind === "in") && !inNow.has(member.id)
      && afterShiftEndGrace(now, timezone, workStart, workEnd, graceMinutes, shiftDate)) {
      alerts.push({ kind: "absent", member, workDate: shiftDate });
    }
  }

  if (alerts.length === 0) return null;
  const lateCount = alerts.filter((alert) => alert.kind === "late").length;
  const absentCount = alerts.filter((alert) => alert.kind === "absent").length;
  return (
    <section aria-label="Attendance alerts" className="card border-amber-200 bg-[#fffdf8]">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow text-warn">Attendance alerts</p><h2 className="mt-1 font-bold">Needs attention</h2><p className="mt-1 text-xs text-muted">Late check-ins are flagged as they happen. A missed check-in is marked absent after work-end plus the grace period.</p></div><span className="chip bg-amber-50 text-warn">{alerts.length} alert{alerts.length === 1 ? "" : "s"}</span></div>
      <ul className="mt-4 divide-y divide-line">{alerts.map((alert) => <li key={`${alert.kind}-${alert.member.id}-${alert.workDate}`} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div><p className="font-semibold">{alert.member.full_name || alert.member.email}</p><p className="text-xs text-muted">{alert.member.team || alert.member.email}{alert.kind === "late" && alert.at ? ` · checked in ${timeLabel(alert.at, timezone)}` : ` · ${alert.workDate}`}</p></div><span className={`chip ${alert.kind === "late" ? "bg-amber-50 text-warn" : "bg-red-50 text-bad"}`}>{alert.kind === "late" ? "Late check-in" : "Absent"}</span></li>)}</ul>
      <p className="mt-4 border-t border-[#ead8c0] pt-3 text-xs text-muted">These are in-app manager alerts; no email or SMS is sent. <Link className="font-semibold underline underline-offset-2" href={`/admin/reports?from=${shiftDate}&to=${shiftDate}`}>View attendance for {shiftDate}</Link>{lateCount + absentCount > 0 ? "." : ""}</p>
    </section>
  );
}
