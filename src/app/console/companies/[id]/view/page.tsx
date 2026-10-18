import Link from "next/link";
import { requireConsole, can, fmtDateTime } from "@/lib/console";
import { MapView } from "@/components/maps/MapView";
import { FLAG_LABELS, WEEKDAYS } from "@/lib/constants";

export const dynamic = "force-dynamic";

type Snapshot = {
  org: { name: string; domain: string; timezone: string; work_start: string; work_end: string; grace_minutes: number; home_radius_m: number; slug: string };
  today: string;
  people: { id: string; name: string; email: string; role: string; status: string; team: string | null; home_status: string; line_manager: string | null;
            today: { kind: string; at: string; type: string; flags: string[] }[] | null }[];
  locations: { name: string; lat: number; lng: number; radius_m: number; address: string | null }[];
  schedule: { weekday: number; mode: string }[];
  pending: { people: number; homes: number; corrections: number; location_requests: number };
};

/** Read-only view of what the company admin sees. Needs the company's support-access permission; every open is logged. */
export default async function ViewAsCompany({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, role } = await requireConsole();
  if (!can.viewAs(role)) return <p className="card text-bad">Your role cannot view companies as their admin.</p>;
  const { data, error } = await supabase.rpc("console_company_snapshot", { p_org: id });
  if (error || !data) return (
    <div className="space-y-3"><Link href={`/console/companies/${id}`} className="text-sm text-muted underline">← Back</Link>
      <p className="card text-bad">{error?.message ?? "Not available."}</p></div>
  );
  const s = data as Snapshot;
  const time = (iso: string) => new Intl.DateTimeFormat("en-NG", { timeZone: s.org.timezone, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  return (
    <div className="space-y-5">
      <div><Link href={`/console/companies/${id}`} className="text-sm text-muted underline">← {s.org.name}</Link>
        <h1 className="page-heading mt-1">Viewing as {s.org.name} admin</h1>
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-warn">Read-only. Allowed because the company turned on support access. This view is recorded in their support log.</p></div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[["People waiting", s.pending.people], ["Home requests", s.pending.homes], ["Corrections", s.pending.corrections], ["Location requests", s.pending.location_requests]].map(([l, v]) =>
          <div key={l} className="card p-4"><p className="text-xs text-muted">{l}</p><p className="mt-1 text-2xl font-bold">{v}</p></div>)}
      </div>

      <section className="card overflow-x-auto"><h2 className="mb-2 font-bold">Today ({s.today}) · work hours {s.org.work_start.slice(0, 5)}–{s.org.work_end.slice(0, 5)}, {s.org.grace_minutes} min grace</h2>
        <table className="table"><thead><tr><th>Person</th><th>Role</th><th>Status</th><th>Line manager</th><th>Today</th></tr></thead>
          <tbody>{s.people.map((p) => <tr key={p.id}>
            <td><div className="font-semibold">{p.name}</div><div className="text-xs text-muted">{p.email}{p.team ? ` · ${p.team}` : ""}</div></td>
            <td className="capitalize">{p.role}</td><td className="capitalize">{p.status}</td><td className="text-xs">{p.line_manager ?? "—"}</td>
            <td className="text-xs">{p.today?.length ? p.today.map((e, i) => <div key={i}>{e.kind === "in" ? "In" : "Out"} {time(e.at)} · {e.type}{e.flags.length ? <span className="text-warn"> · {e.flags.map((f) => FLAG_LABELS[f] ?? f).join(", ")}</span> : null}</div>) : <span className="text-muted">No check-in</span>}</td>
          </tr>)}</tbody></table></section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card space-y-2"><h2 className="font-bold">Offices</h2>
          {s.locations.length ? <MapView height={240} label="Company offices" markers={s.locations.map((l) => ({ lat: l.lat, lng: l.lng, label: l.name }))} circles={s.locations.map((l) => ({ lat: l.lat, lng: l.lng, radius: l.radius_m }))} /> : <p className="text-sm text-muted">No office set.</p>}
          <ul className="text-sm">{s.locations.map((l) => <li key={l.name}><b>{l.name}</b> · {l.radius_m} m{l.address ? ` · ${l.address}` : ""}</li>)}</ul></section>
        <section className="card"><h2 className="mb-2 font-bold">Company work week</h2>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">{WEEKDAYS.map((d, i) => { const mode = s.schedule.find((x) => x.weekday === i + 1)?.mode ?? "office"; return <div key={d} className={`rounded-lg py-2 ${mode === "office" ? "bg-ink text-white" : mode === "home" ? "bg-brand/10 text-brand-dark" : "bg-paper text-muted"}`}><div className="font-semibold">{d}</div><div className="capitalize">{mode}</div></div>; })}</div>
          <p className="mt-3 text-xs text-muted">Opened {fmtDateTime(new Date().toISOString())}. Company link /{s.org.slug} · home radius {s.org.home_radius_m} m.</p></section>
      </div>
    </div>
  );
}
