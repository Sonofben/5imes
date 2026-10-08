import Link from "next/link";
import { requireMember, todayIn, timeIn, isoWeekdayIn, expectedMode, type Member } from "@/lib/session";
import { AutoRefresh } from "@/components/AutoRefresh";
import { FLAG_LABELS } from "@/lib/constants";

export const dynamic = "force-dynamic";

type Event = {
  member_id: string;
  kind: "in" | "out";
  at: string;
  location_type: string;
  location_id: string | null;
  flags: string[];
};

export default async function TodayPage() {
  const { supabase, org } = await requireMember({ viewer: true });
  const today = todayIn(org.timezone);
  const weekday = isoWeekdayIn(org.timezone);

  const [{ data: members }, { data: events }, { data: schedules }, { data: locations }] = await Promise.all([
    supabase.from("members").select("*").eq("org_id", org.id).eq("status", "active").order("full_name"),
    supabase
      .from("attendance")
      .select("member_id, kind, at, location_type, location_id, flags")
      .eq("org_id", org.id)
      .eq("local_date", today)
      .order("at"),
    supabase.from("schedules").select("member_id, weekday, mode").eq("org_id", org.id),
    supabase.from("locations").select("id, name").eq("org_id", org.id),
  ]);

  const locName = new Map((locations ?? []).map((l) => [l.id, l.name]));
  const byMember = new Map<string, Event[]>();
  for (const e of (events ?? []) as Event[]) {
    byMember.set(e.member_id, [...(byMember.get(e.member_id) ?? []), e]);
  }

  const rows = ((members ?? []) as Member[]).map((m) => {
    const ev = byMember.get(m.id) ?? [];
    const first = ev.find((e) => e.kind === "in");
    const last = ev.at(-1);
    const flags = [...new Set(ev.flatMap((e) => e.flags))];
    const expected = expectedMode(schedules ?? [], m.id, weekday);
    return { m, first, last, flags, expected, inNow: last?.kind === "in" };
  });

  const working = rows.filter((r) => r.expected !== "off");
  const stats = [
    { label: "Checked in now", value: rows.filter((r) => r.inNow).length },
    { label: "At office", value: rows.filter((r) => r.inNow && r.last?.location_type === "office").length },
    { label: "At home", value: rows.filter((r) => r.inNow && r.last?.location_type === "home").length },
    { label: "Not in yet", value: working.filter((r) => !r.first).length },
    { label: "Flagged", value: rows.filter((r) => r.flags.length).length, warn: true },
  ];

  const order = (r: (typeof rows)[number]) => (r.flags.length ? 0 : r.inNow ? 1 : r.first ? 2 : r.expected === "off" ? 4 : 3);
  rows.sort((a, b) => order(a) - order(b));

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={60} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Today</h1>
          <p className="text-sm text-muted">
            {new Date().toLocaleDateString("en-NG", { timeZone: org.timezone, weekday: "long", day: "numeric", month: "long" })} · updates every minute
          </p>
        </div>
        <Link href={`/admin/reports?from=${today}&to=${today}`} className="btn-ghost btn-sm">Today’s report</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <div className={`text-3xl font-extrabold ${s.warn && s.value ? "text-brand" : ""}`}>{s.value}</div>
            <div className="text-xs text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      {rows.length <= 1 && (
        <div className="card border-dashed text-sm">
          <b>Get started:</b> add your office in <Link className="underline" href="/admin/locations">Locations</Link>, then invite your
          team from <Link className="underline" href="/admin/staff">Staff</Link>.
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Today</th>
              <th>Status</th>
              <th>First in</th>
              <th>Last out</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ m, first, last, flags, expected, inNow }) => (
              <tr key={m.id}>
                <td>
                  <div className="font-medium">{m.full_name || m.email}</div>
                  <div className="text-xs text-muted">{m.team || m.email}</div>
                </td>
                <td className="capitalize">{expected}</td>
                <td>
                  {inNow ? (
                    <span className="chip bg-green-50 text-ok">
                      In · {last!.location_type === "office" ? locName.get(last!.location_id!) ?? "Office" : last!.location_type === "home" ? "Home" : "Unknown location"}
                    </span>
                  ) : first ? (
                    <span className="chip bg-paper text-muted">Checked out</span>
                  ) : expected === "off" ? (
                    <span className="chip bg-paper text-muted">Off</span>
                  ) : (
                    <span className="chip bg-red-50 text-bad">Not in</span>
                  )}
                </td>
                <td>{first ? timeIn(first.at, org.timezone) : "—"}</td>
                <td>{last?.kind === "out" ? timeIn(last.at, org.timezone) : "—"}</td>
                <td className="text-xs text-warn">{flags.map((f) => FLAG_LABELS[f] ?? f).join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
