import Link from "next/link";
import { requireConsole, can, naira, fmtDate, fmtDateTime } from "@/lib/console";
import { Flash } from "@/components/Flash";
import { extendTrial, grantComplimentary, invitePerson, setSuspended, transferOwner, changeDomain, setPlan, setArchived, deleteCompany } from "./actions";

export const dynamic = "force-dynamic";

type Detail = {
  org: { id: string; name: string; domain: string; slug: string; timezone: string; created_at: string; suspended_at: string | null; logo_url: string | null; archived_at?: string | null };
  owner: { name: string | null; email: string } | null;
  subscription: { plan: string; status: string; trial_ends_at: string | null; current_period_end: string | null; seats_paid: number; billing_interval_months: number; paystack_subscription_code: string | null; cancel_at_period_end: boolean } | null;
  counts: { active: number; invited: number; pending: number; disabled: number; stale_invites: number; offices: number };
  last_check_in: string | null;
  support_until: string | null;
  payments: { reference: string; provider: string; kind: string; status: string; plan: string; seats: number; billing_interval_months: number; amount_kobo: number; created_at: string; note: string | null }[];
  audit: { at: string; action: string; actor_email: string | null; reason: string | null }[];
};
type StaffRow = { full_name: string | null; email: string; role: string; status: string; team: string | null; home_status: string; last_check_in: string | null };

function Reason() { return <input name="reason" required minLength={5} placeholder="Reason (saved in audit log)" className="input" />; }

export default async function ConsoleCompany({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; error?: string; staff?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, role } = await requireConsole();
  const { data, error } = await supabase.rpc("console_company", { p_org: id });
  if (error || !data) return <p className="card text-bad">{error?.message ?? "Company not found."}</p>;
  const d = data as Detail;
  const { data: archivedRows } = await supabase.rpc("console_companies", { p_search: d.org.domain, p_archived: true });
  const isArchived = ((archivedRows ?? []) as { id: string }[]).some((r) => r.id === id);
  const s = d.subscription;
  let staff: StaffRow[] | null = null; let staffError: string | null = null;
  if (sp.staff === "1" && can.staff(role)) {
    const r = await supabase.rpc("console_staff_list", { p_org: id });
    staff = (r.data ?? []) as StaffRow[]; staffError = r.error?.message ?? null;
  }
  const used = d.counts.active + d.counts.invited;
  const warnings = [
    d.org.suspended_at && "Company is suspended — check-ins are paused.",
    s?.status === "trialing" && s.trial_ends_at && new Date(s.trial_ends_at) < new Date() && "Trial has ended — admins cannot add people and staff cannot check in.",
    s && ["active", "past_due"].includes(s.status) && s.current_period_end && new Date(s.current_period_end) < new Date() && "Paid term has ended.",
    s && s.status !== "trialing" && used >= s.seats_paid && `Seats are full (${used}/${s.seats_paid}) — new invites will fail.`,
    d.counts.pending > 0 && `${d.counts.pending} people waiting for the admin to approve them.`,
    d.counts.stale_invites > 0 && `${d.counts.stale_invites} invites not accepted after 3 days (wrong email or email not received?).`,
    d.counts.offices === 0 && "No office location set — office check-ins will be flagged.",
    !d.last_check_in && "No check-ins yet.",
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-5">
      <div><Link href="/console/companies" className="text-sm text-muted underline">← Companies</Link>
        <h1 className="page-heading mt-1">{d.org.name}</h1>
        <p className="text-sm text-muted">@{d.org.domain} · link /{d.org.slug} · joined {fmtDate(d.org.created_at)} · owner {d.owner ? `${d.owner.name ?? ""} <${d.owner.email}>` : "—"}</p></div>
      <Flash msg={sp.msg} error={sp.error} />
      {isArchived && <p className="card border-red-200 bg-red-50 text-sm text-bad">This company is archived: hidden from lists and suspended.</p>}

      <div className="flex flex-wrap gap-2">
        {can.viewAs(role) && <Link href={`/console/companies/${id}/view`} className="btn-ghost btn-sm">{d.support_until ? "View as company admin (read-only, logged)" : "View as company admin — needs their permission"}</Link>}
        {can.export(role) && <form action={`/console/companies/${id}/export`} method="get" className="flex gap-2"><input name="reason" required minLength={5} placeholder="Reason for export" className="input min-h-9 py-1 text-sm" aria-label="Reason for export" /><button className="btn-ghost btn-sm">Export company data</button></form>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card space-y-1 text-sm"><h2 className="mb-2 font-bold">Subscription</h2>
          <p>Plan: <b className="capitalize">{s?.plan}</b> · status <b>{s?.status}</b></p>
          <p>{s?.status === "trialing" ? `Trial ends ${fmtDate(s.trial_ends_at)}` : `Paid until ${fmtDate(s?.current_period_end)}`}</p>
          <p>Seats paid: {s?.status === "trialing" ? "trial (unlimited)" : s?.seats_paid} · term {s?.billing_interval_months} month(s)</p>
          <p>Auto-renew: {s?.paystack_subscription_code && !s.cancel_at_period_end ? "on" : "off"}</p></section>
        <section className="card space-y-1 text-sm"><h2 className="mb-2 font-bold">Usage (counts only)</h2>
          <p>Active {d.counts.active} · Invited {d.counts.invited} · Pending {d.counts.pending} · Disabled {d.counts.disabled}</p>
          <p>Offices: {d.counts.offices}</p><p>Last check-in: {fmtDateTime(d.last_check_in)}</p>
          <p>Support access: {d.support_until ? <b className="text-warn">on until {fmtDateTime(d.support_until)}</b> : "not granted"}</p></section>
        <section className="card text-sm"><h2 className="mb-2 font-bold">Health</h2>
          {warnings.length === 0 ? <p className="text-ok">No problems detected.</p> : <ul className="list-disc space-y-1 pl-5 text-warn">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>}</section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {can.invite(role) && <form action={invitePerson.bind(null, id)} className="card space-y-2"><h2 className="font-bold">Add a person for them</h2><p className="text-xs text-muted">Uses their rules (email domain, seat limit) and sends the invite email.</p>
          <div className="grid gap-2 sm:grid-cols-2"><input name="email" type="email" required placeholder={`name@${d.org.domain}`} className="input" /><input name="name" placeholder="Full name" className="input" /></div><Reason /><button className="btn-primary">Add person</button></form>}
        {can.trial(role) && <form action={extendTrial.bind(null, id)} className="card space-y-2"><h2 className="font-bold">Extend trial</h2>
          <select name="days" className="input" defaultValue="14"><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option></select><Reason /><button className="btn-primary">Extend trial</button></form>}
        {can.complimentary(role) && <form action={grantComplimentary.bind(null, id)} className="card space-y-2"><h2 className="font-bold">Complimentary term (₦0)</h2>
          <div className="grid grid-cols-3 gap-2"><select name="plan" className="input" defaultValue={s?.plan ?? "basic"}><option value="basic">Basic</option><option value="pro">Pro</option></select><input name="seats" type="number" min={Math.max(1, used)} defaultValue={Math.max(1, used)} className="input" /><select name="months" className="input" defaultValue="1"><option value="1">1 month</option><option value="3">3 months</option><option value="6">6 months</option><option value="12">12 months</option></select></div>
          <Reason /><button className="btn-primary">Grant term</button></form>}
        {can.setPlan(role) && <form action={setPlan.bind(null, id)} className="card space-y-2"><h2 className="font-bold">Change plan and seats</h2><p className="text-xs text-muted">Changes the plan and paid seats now, without a payment. Term dates stay the same.</p>
          <div className="grid grid-cols-2 gap-2"><select name="plan" className="input" defaultValue={s?.plan ?? "pro"}><option value="basic">Basic</option><option value="pro">Pro</option></select><input name="seats" type="number" min={1} defaultValue={Math.max(1, s?.seats_paid ?? used)} className="input" aria-label="Paid seats" /></div>
          <Reason /><button className="btn-primary">Save plan</button></form>}
        {can.archive(role) && <form action={setArchived.bind(null, id, !isArchived)} className="card space-y-2"><h2 className="font-bold">{isArchived ? "Restore from archive" : "Archive company"}</h2>
          <p className="text-xs text-muted">{isArchived ? "Brings the company back into the lists. It stays suspended until you reactivate it." : "Hides the company from lists and suspends it. Nothing is deleted."}</p>
          <Reason /><button className={isArchived ? "btn-primary" : "btn-ghost text-bad"}>{isArchived ? "Restore" : "Archive"}</button></form>}
        {can.ownerOnly(role) && isArchived && <form action={deleteCompany.bind(null, id)} className="card space-y-2 border-red-200"><h2 className="font-bold text-bad">Delete permanently</h2>
          <p className="text-xs text-muted">Deletes the company, its people, locations, attendance and payment records. This cannot be undone. Export first if you need the data.</p>
          <input name="confirm" required placeholder={`Type ${d.org.domain} to confirm`} className="input" aria-label="Type the domain to confirm" /><Reason /><button className="btn-ghost text-bad">Delete company</button></form>}
        {can.ownerOnly(role) && <div className="card space-y-4">
          <form action={setSuspended.bind(null, id, !d.org.suspended_at)} className="space-y-2"><h2 className="font-bold">{d.org.suspended_at ? "Reactivate company" : "Suspend company"}</h2><Reason /><button className={d.org.suspended_at ? "btn-primary" : "btn-ghost text-bad"}>{d.org.suspended_at ? "Reactivate" : "Suspend"}</button></form>
          <form action={transferOwner.bind(null, id)} className="space-y-2 border-t border-line pt-3"><h2 className="font-bold">Transfer ownership</h2><input name="email" type="email" required placeholder={`active member @${d.org.domain}`} className="input" /><Reason /><button className="btn-ghost">Transfer</button></form>
          <form action={changeDomain.bind(null, id)} className="space-y-2 border-t border-line pt-3"><h2 className="font-bold">Change email domain</h2><input name="domain" required defaultValue={d.org.domain} className="input" /><Reason /><button className="btn-ghost">Update domain</button></form>
        </div>}
      </div>

      {can.staff(role) && <section className="card space-y-3"><div className="flex items-center justify-between"><h2 className="font-bold">Staff list</h2>
        {!staff && <Link href={`/console/companies/${id}?staff=1`} className="btn-ghost btn-sm">{d.support_until ? "Open staff list (logged)" : "Requires support access"}</Link>}</div>
        {!d.support_until && !staff && <p className="text-sm text-muted">Hidden until the company admin grants support access in their Settings.</p>}
        {staffError && <p className="text-sm text-bad">{staffError}</p>}
        {staff && <div className="overflow-x-auto"><table className="table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Home</th><th>Last check-in</th></tr></thead>
          <tbody>{staff.map((m) => <tr key={m.email}><td>{m.full_name ?? "—"}</td><td>{m.email}</td><td>{m.role}</td><td>{m.status}</td><td>{m.home_status}</td><td>{fmtDateTime(m.last_check_in)}</td></tr>)}</tbody></table></div>}
      </section>}

      <section className="card overflow-x-auto"><h2 className="mb-2 font-bold">Payments</h2>
        <table className="table"><thead><tr><th>Date</th><th>Via</th><th>What</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>{d.payments.length === 0 ? <tr><td colSpan={5} className="text-muted">No payments yet.</td></tr> : d.payments.map((p) => <tr key={p.reference}><td className="text-xs">{fmtDateTime(p.created_at)}</td><td className="capitalize">{p.provider}</td><td>{p.kind === "seat_increase" ? `Seats → ${p.seats}` : `${p.plan} · ${p.seats} seats · ${p.billing_interval_months} mo`}{p.note ? <span className="text-muted"> · {p.note}</span> : null}</td><td className="tabular-nums">{naira(p.amount_kobo)}</td><td>{p.status}</td></tr>)}</tbody></table></section>

      <section className="card"><h2 className="mb-2 font-bold">Global Admin actions on this company</h2>
        {d.audit.length === 0 ? <p className="text-sm text-muted">None yet.</p> : <ul className="divide-y divide-line text-sm">{d.audit.map((a, i) => <li key={i} className="flex flex-wrap justify-between gap-2 py-2"><span><span className="font-mono text-xs">{a.action}</span> · {a.actor_email}{a.reason ? <span className="text-muted"> · {a.reason}</span> : null}</span><span className="text-xs text-muted">{fmtDateTime(a.at)}</span></li>)}</ul>}</section>
    </div>
  );
}
