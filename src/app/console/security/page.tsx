import Link from "next/link";
import { requireConsole, fmtDateTime } from "@/lib/console";
import { friendly } from "@/lib/errors";
import { parseOrNull, ConsoleSecurity } from "@/lib/jsonShapes";

export const dynamic = "force-dynamic";

const LIMIT_LABEL: Record<string, string> = {
  workspace_create: "New workspaces", workspace_join: "Joining a company", invite: "Staff invitations", check_in: "Check-ins",
  presence: "Location checks", work_elsewhere: "Work-elsewhere requests", home_request: "Home location requests",
  correction_request: "Attendance correction requests", recovery_try: "Recovery-code guesses", recovery_reset: "New recovery codes",
  support_grant: "Support access grants", payment_start: "Payment checkouts", payment_verify: "Payment checks",
  report_export: "Report exports", password_change: "Password changes", logo_upload: "Logo uploads", invite_email: "Invitation emails",
  console_invite: "Global Admin invitations", console_sensitive: "Global Admin sensitive actions", console_export: "Global Admin exports",
  console_action: "Global Admin actions",
};
const windowLabel = (secs: number) => secs >= 86400 ? "day" : secs >= 3600 ? "hour" : `${Math.round(secs / 60)} minutes`;
const KIND: Record<string, string> = { password_set: "Password set", password_changed: "Password changed", password_reset: "Password reset", totp_enrolled: "Two-factor turned on", totp_disabled: "Two-factor turned off", recovery_regenerated: "Recovery codes renewed", recovery_used: "Recovery code used" };

export default async function SecurityPage() {
  const { supabase } = await requireConsole();
  const [{ data, error }, { data: limitRows }] = await Promise.all([
    supabase.rpc("console_security"),
    supabase.rpc("console_rate_limits"),
  ]);
  const limits = (limitRows ?? []);
  if (error || !data) return <p className="card text-bad">{(error ? friendly(error, "console/security") : "No data.")}</p>;
  const s = parseOrNull(ConsoleSecurity, data, "console/security");
  if (!s) return <p className="card text-bad">This data came back in an unexpected shape, so it isn’t shown. The details were logged.</p>;
  const missing = s.admin_2fa.filter((c) => c.missing > 0);
  return (
    <div className="space-y-6">
      <div><h1 className="page-heading">Security center</h1><p className="page-description">Two-factor coverage for company admins, locked accounts and recent security events. Use <Link className="underline" href="/console/people">People</Link> to sign someone out, lock an account or reset two-factor.</p></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["Sign-ins (24 h)", s.sign_ins_24h], ["Limits reached (7 days)", limits.length], ["Locked accounts", s.locked.length], ["Companies with admins lacking 2FA", missing.length]].map(([l, v]) =>
          <div key={l} className="card p-4"><p className="text-xs text-muted">{l}</p><p className="mt-1 text-2xl font-bold">{v}</p></div>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card"><h2 className="mb-2 font-bold">Company admins without two-factor</h2>
          {missing.length === 0 ? <p className="text-sm text-ok">Every company admin has two-factor on.</p> :
            <ul className="divide-y divide-line text-sm">{missing.map((c) => <li key={c.id} className="flex justify-between py-2"><Link className="underline" href={`/console/companies/${c.id}`}>{c.name}</Link><span className="text-warn">{c.missing} of {c.admins} admin{c.admins === 1 ? "" : "s"}</span></li>)}</ul>}</section>
        <section className="card"><h2 className="mb-2 font-bold">Locked accounts</h2>
          {s.locked.length === 0 ? <p className="text-sm text-muted">None.</p> :
            <ul className="divide-y divide-line text-sm">{s.locked.map((u) => <li key={u.user_id} className="flex justify-between py-2"><Link className="underline" href={`/console/people?email=${encodeURIComponent(u.email)}`}>{u.email}</Link><span className="text-muted">{u.company ?? "—"}</span></li>)}</ul>}</section>
      </div>
      <section className="card overflow-x-auto"><h2 className="mb-1 font-bold">Limits reached (last 7 days)</h2>
        <p className="mb-2 text-sm text-muted">Someone used up an allowance, for example too many recovery-code guesses or invitations. One entry can be normal; many from the same person or company may be an attack.</p>
        <table className="table"><thead><tr><th>When</th><th>What</th><th>Who</th><th>Company</th><th>Used</th></tr></thead>
          <tbody>{limits.length === 0 ? <tr><td colSpan={5} className="text-muted">No limits reached.</td></tr> : limits.map((l, i) => <tr key={i}><td className="text-xs">{fmtDateTime(l.window_start)}</td><td>{LIMIT_LABEL[l.bucket] ?? l.bucket}</td><td>{l.who ?? "—"}</td><td>{l.company ?? "—"}</td><td className="tabular-nums">{l.hits} of {l.max_hits} per {windowLabel(l.window_seconds)}</td></tr>)}</tbody></table></section>
      <section className="card overflow-x-auto"><h2 className="mb-2 font-bold">Recent account security events</h2>
        <table className="table"><thead><tr><th>When</th><th>Event</th><th>Person</th><th>Company</th></tr></thead>
          <tbody>{s.events.length === 0 ? <tr><td colSpan={4} className="text-muted">No events yet.</td></tr> : s.events.map((e, i) => <tr key={i}><td className="text-xs">{fmtDateTime(e.created_at)}</td><td>{KIND[e.kind] ?? e.kind}</td><td>{e.email ?? "—"}</td><td>{e.company ?? "—"}</td></tr>)}</tbody></table></section>
      <section className="card"><h2 className="mb-2 font-bold">Recent Global Admin security and team actions</h2>
        {s.global_admin_actions.length === 0 ? <p className="text-sm text-muted">None yet.</p> :
          <ul className="divide-y divide-line text-sm">{s.global_admin_actions.map((a, i) => <li key={i} className="flex flex-wrap justify-between gap-2 py-2"><span><span className="font-mono text-xs">{a.action}</span> · {a.actor_email}{a.reason ? <span className="text-muted"> · {a.reason}</span> : null}</span><span className="text-xs text-muted">{fmtDateTime(a.at)}</span></li>)}</ul>}</section>
    </div>
  );
}
