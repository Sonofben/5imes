import Link from "next/link";
import { requireMember, todayIn, timeIn, isoWeekdayIn, expectedMode } from "@/lib/session";
import { Logo } from "@/components/Logo";
import { CheckInPanel } from "./CheckInPanel";
import { HomeLocationPanel } from "./HomeLocationPanel";
import { FLAG_LABELS, WEEKDAYS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function StaffApp() {
  const { supabase, me, org, isViewer } = await requireMember();
  const today = todayIn(org.timezone);
  const weekday = isoWeekdayIn(org.timezone);

  const [{ data: schedules }, { data: events }] = await Promise.all([
    supabase.from("schedules").select("member_id, weekday, mode").eq("org_id", org.id),
    supabase
      .from("attendance")
      .select("id, kind, at, location_type, flags, distance_m")
      .eq("member_id", me.id)
      .eq("local_date", today)
      .order("at", { ascending: true }),
  ]);

  const expected = expectedMode(schedules ?? [], me.id, weekday);
  const last = events?.at(-1);
  const checkedIn = last?.kind === "in";
  const week = WEEKDAYS.map((d, i) => ({ d, mode: expectedMode(schedules ?? [], me.id, i + 1) }));

  return (
    <main className="mx-auto max-w-md px-4 pb-16">
      <header className="flex items-center justify-between py-5">
        <Logo href="/app" />
        <div className="flex items-center gap-2">
          {isViewer && <Link href="/admin" className="btn-ghost btn-sm">Admin</Link>}
          <form action="/auth/signout" method="post">
            <button className="btn-ghost btn-sm">Sign out</button>
          </form>
        </div>
      </header>

      <section className="mb-6">
        <p className="text-sm text-muted">{org.name}</p>
        <h1 className="text-2xl font-bold">Hi {me.full_name?.split(" ")[0] || me.email.split("@")[0]}</h1>
      </section>

      <section className="card mb-4 py-8">
        <CheckInPanel checkedIn={checkedIn} expected={expected} />
      </section>

      <section className="card mb-4">
        <h2 className="mb-3 font-bold">Today</h2>
        {events && events.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3">
                <span>
                  <b>{e.kind === "in" ? "In" : "Out"}</b> · {timeIn(e.at, org.timezone)}{" "}
                  <span className="text-muted">
                    ({e.location_type === "none" ? "outside approved locations" : e.location_type})
                  </span>
                </span>
                {e.flags.length > 0 && (
                  <span className="chip bg-amber-50 text-warn">{e.flags.map((f: string) => FLAG_LABELS[f] ?? f).join(", ")}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No check-ins yet today.</p>
        )}
      </section>

      <section className="card mb-4">
        <h2 className="mb-3 font-bold">My week</h2>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {week.map((w, i) => (
            <div
              key={w.d}
              className={`rounded-lg py-2 ${i + 1 === weekday ? "ring-2 ring-ink" : ""} ${
                w.mode === "office" ? "bg-ink text-white" : w.mode === "home" ? "bg-brand/15 text-brand-dark" : "bg-paper text-muted"
              }`}
            >
              <div className="font-semibold">{w.d}</div>
              <div className="opacity-80">{w.mode === "off" ? "Off" : w.mode === "home" ? "Home" : "Office"}</div>
            </div>
          ))}
        </div>
      </section>

      <HomeLocationPanel
        status={me.home_status}
        hasApproved={me.home_lat !== null}
        hasPending={me.home_req_lat !== null}
      />

      <p className="mt-8 text-center text-xs text-muted">
        Tip: add 5ime to your home screen from your browser menu so it opens like an app.
      </p>
    </main>
  );
}
