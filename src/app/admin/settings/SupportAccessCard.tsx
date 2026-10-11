import { grantSupport, revokeSupport } from "./actions";

type LogRow = { at: string; action: string; actor_email: string | null; reason: string | null };
const ACTIONS: Record<string, string> = {
  "support.view_staff": "Viewed your staff list (support access)",
  "trial.extend": "Extended your trial",
  "billing.complimentary": "Added a complimentary term",
  "member.invite": "Added a person for you",
  "company.suspend": "Suspended the account",
  "company.reactivate": "Reactivated the account",
  "company.transfer_owner": "Transferred ownership",
  "company.domain": "Changed your email domain",
};

export function SupportAccessCard({ until, log, timezone }: { until: string | null; log: LogRow[]; timezone: string }) {
  const fmt = (d: string) => new Intl.DateTimeFormat("en-NG", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(d));
  return (
    <section className="card space-y-4">
      <div><p className="eyebrow">Support access</p><h2 className="mt-1 text-lg font-bold">Let 5ime support help</h2>
        <p className="mt-1 text-sm text-muted">By default, 5ime support can see your company&apos;s plan and counts only — never your staff list or attendance. If you need hands-on help, grant temporary access. It switches off by itself.</p></div>
      {until ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm">
          <span>Support access is <b>on</b> until {fmt(until)}.</span>
          <form action={revokeSupport}><button className="btn-ghost btn-sm">Turn off now</button></form>
        </div>
      ) : (
        <form action={grantSupport} className="flex flex-wrap items-center gap-2">
          <select name="hours" className="input w-auto" defaultValue="24"><option value="24">For 24 hours</option><option value="72">For 72 hours</option></select>
          <button className="btn-ghost">Grant support access</button>
        </form>
      )}
      <div>
        <h3 className="text-sm font-semibold">What 5ime support did in your account</h3>
        {log.length === 0 ? <p className="mt-1 text-sm text-muted">Nothing yet.</p> : (
          <ul className="mt-2 divide-y divide-line text-sm">{log.map((row, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2 py-2"><span>{ACTIONS[row.action] ?? row.action}{row.reason ? <span className="text-muted"> · {row.reason}</span> : null}</span><span className="text-xs text-muted">{fmt(row.at)}</span></li>
          ))}</ul>
        )}
      </div>
    </section>
  );
}
