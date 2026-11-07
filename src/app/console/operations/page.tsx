import Link from "next/link";
import { requireConsole, fmtDateTime, naira } from "@/lib/console";
import { friendly } from "@/lib/errors";

export const dynamic = "force-dynamic";

type Job = { job: string; started_at: string; finished_at: string | null; ok: boolean | null; detail: string | null; failures_24h: number };
type Ops = {
  jobs: Job[];
  emails: { sent_24h: number; failed_24h: number; sent_7d: number; failed_7d: number; recent_failures: { kind: string; to_domain: string | null; detail: string | null; created_at: string }[] };
  payments: { failed_7d: number; pending_over_1h: number; renewal_sync_pending: number; recent_failed: { reference: string; org_name: string; kind: string; amount_kobo: number; provider: string; created_at: string }[] };
  support: { open: number; urgent_open: number };
  privacy: { open: number; overdue: number };
};
const LABEL: Record<string, string> = { schedule_automation: "Automatic check in and check out", celebration_emails: "Celebration emails", task_reminders: "Task reminders", cleanup: "Clean up old records", renewal_price_sync: "Renewal price sync with Paystack", visitor_cleanup: "Visitor clean-up (retention)", indexnow: "Tell search engines about pages (daily)" };

function Tile({ label, value, bad, href }: { label: string; value: number | string; bad?: boolean; href?: string }) {
  const body = <><p className="text-xs text-muted">{label}</p><p className={`mt-1 text-2xl font-extrabold tabular-nums ${bad ? "text-bad" : ""}`}>{value}</p></>;
  return href ? <Link href={href} className="card block hover:border-ink">{body}</Link> : <div className="card">{body}</div>;
}

export default async function Operations() {
  const { supabase } = await requireConsole();
  const { data, error } = await supabase.rpc("console_operations");
  if (error || !data) return <p className="card text-bad">{error ? friendly(error, "console/operations") : "No data."}</p>;
  const d = data as unknown as Ops;
  const stale = (j: Job) => Date.now() - new Date(j.started_at).getTime() > 30 * 60_000;
  return (
    <div className="space-y-5">
      <div><h1 className="page-heading">Operations</h1><p className="text-sm text-muted">Whether background jobs, emails and payments are working. Jobs run every 5 minutes from the server timer.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Emails failed (24 h)" value={d.emails.failed_24h} bad={d.emails.failed_24h > 0} />
        <Tile label="Payments failed (7 days)" value={d.payments.failed_7d} bad={d.payments.failed_7d > 0} />
        <Tile label="Open support tickets" value={`${d.support.open}${d.support.urgent_open ? ` (${d.support.urgent_open} urgent)` : ""}`} bad={d.support.urgent_open > 0} href="/console/support" />
        <Tile label="Data requests overdue" value={d.privacy.overdue} bad={d.privacy.overdue > 0} href="/console/data-requests" />
      </div>
      <section className="card space-y-2">
        <h2 className="font-bold">Background jobs</h2>
        {d.jobs.length === 0 ? <p className="text-sm text-bad">No job has run yet. Check that the server timer and CRON_SECRET are set up (DEPLOY.md §16).</p> : (
          <table className="table"><thead><tr><th>Job</th><th>Last run</th><th>Result</th><th>Failures (24 h)</th></tr></thead>
            <tbody>{d.jobs.map((j) => <tr key={j.job}><td>{LABEL[j.job] ?? j.job}</td><td className={`text-xs ${stale(j) ? "font-semibold text-bad" : ""}`}>{fmtDateTime(j.started_at)}{stale(j) ? " · late" : ""}</td>
              <td>{j.ok ? <span className="chip bg-green-50 text-ok" title={j.detail ?? ""}>OK</span> : <span className="chip bg-red-50 text-bad" title={j.detail ?? ""}>Failed</span>}</td><td className="tabular-nums">{j.failures_24h}</td></tr>)}</tbody></table>
        )}
      </section>
      <section className="card space-y-2">
        <h2 className="font-bold">Emails</h2>
        <p className="text-sm">Last 24 hours: <b>{d.emails.sent_24h}</b> sent, <b className={d.emails.failed_24h ? "text-bad" : ""}>{d.emails.failed_24h}</b> failed. Last 7 days: {d.emails.sent_7d} sent, {d.emails.failed_7d} failed.</p>
        {d.emails.recent_failures.length > 0 && <table className="table"><thead><tr><th>When</th><th>Type</th><th>To (domain)</th><th>Reason</th></tr></thead>
          <tbody>{d.emails.recent_failures.map((e, i) => <tr key={i}><td className="text-xs">{fmtDateTime(e.created_at)}</td><td>{e.kind}</td><td>{e.to_domain}</td><td className="text-xs">{e.detail}</td></tr>)}</tbody></table>}
      </section>
      <section className="card space-y-2">
        <h2 className="font-bold">Payments</h2>
        <p className="text-sm">Waiting more than an hour: <b>{d.payments.pending_over_1h}</b> · Renewal price waiting for Paystack: <b>{d.payments.renewal_sync_pending}</b></p>
        {d.payments.recent_failed.length > 0 && <table className="table"><thead><tr><th>When</th><th>Company</th><th>Type</th><th>Amount</th><th>Provider</th></tr></thead>
          <tbody>{d.payments.recent_failed.map((p) => <tr key={p.reference}><td className="text-xs">{fmtDateTime(p.created_at)}</td><td>{p.org_name}</td><td>{p.kind}</td><td>{naira(p.amount_kobo)}</td><td>{p.provider}</td></tr>)}</tbody></table>}
      </section>
    </div>
  );
}
