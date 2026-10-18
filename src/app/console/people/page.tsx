import Link from "next/link";
import { requireConsole, can, fmtDateTime, ROLE_LABELS } from "@/lib/console";
import type { Rpc } from "@/lib/database.types";
import { lookup } from "@/lib/schemas";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { Reason } from "../Reason";
import { forceSignout, setLocked, resetMfa, sendPasswordReset } from "../actions";
import { friendly } from "@/lib/errors";

export const dynamic = "force-dynamic";

type Person = Rpc<"console_find_person">[number];

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ email?: string; msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, role } = await requireConsole();
  if (!can.people(role)) return <p className="card text-bad">Your role cannot look up people.</p>;
  let people: Person[] = []; let lookupError: string | null = null;
  if (sp.email) {
    const r = await supabase.rpc("console_find_person", { p_email: sp.email });
    people = (r.data ?? []); lookupError = r.error ? friendly(r.error, "console/people") : null;
  }
  return (
    <div className="space-y-5">
      <div><h1 className="page-heading">Find a person</h1>
        <p className="page-description">Look up any account by its full email address: which company, role, status, last sign-in and two-factor. Searching by part of a name isn’t allowed, so nobody can browse a company’s staff without its permission. Every lookup is logged.</p></div>
      <form className="flex flex-wrap gap-2"><input name="email" type="email" required defaultValue={sp.email} placeholder="name@company.com" className="input w-80" aria-label="Email address" /><button className="btn-primary">Look up</button></form>
      <Flash msg={readFlash(sp).msg} error={readFlash(sp).error ?? lookupError ?? undefined} />
      {sp.email && !lookupError && people.length === 0 && <p className="card text-sm text-muted">No account or invitation uses {sp.email}.</p>}
      {people.map((p) => (
        <article key={`${p.user_id}-${p.org_id}`} className="card space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-lg font-bold">{p.full_name || p.email}</p><p className="text-sm text-muted">{p.email}</p></div>
            <div className="flex flex-wrap gap-2">
              {p.locked && <span className="chip bg-red-50 text-bad">Locked</span>}
              <span className={`chip ${p.totp_enrolled ? "bg-green-50 text-ok" : "bg-paper text-muted"}`}>{p.totp_enrolled ? "Two-factor on" : "No two-factor"}</span>
              {p.global_admin_role && <span className="chip bg-ink text-white">{lookup(ROLE_LABELS, p.global_admin_role, p.global_admin_role)}</span>}
            </div>
          </div>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div><dt className="inline text-muted">Company: </dt><dd className="inline">{p.org_id ? <Link className="underline" href={`/console/companies/${p.org_id}`}>{p.company}</Link> : "—"}</dd></div>
            <div><dt className="inline text-muted">Role / status: </dt><dd className="inline capitalize">{p.role ?? "—"} · {p.status ?? "no membership"}</dd></div>
            <div><dt className="inline text-muted">Last sign-in: </dt><dd className="inline">{fmtDateTime(p.last_sign_in_at)}</dd></div>
            <div><dt className="inline text-muted">Login account: </dt><dd className="inline">{p.user_id ? "Created" : "Not yet (invited only)"}</dd></div>
          </dl>
          <div className="grid gap-3 lg:grid-cols-2">
            <form action={sendPasswordReset.bind(null, p.email, p.org_id)} className="space-y-2 rounded-xl border border-line p-3"><p className="font-semibold">Send password reset email</p><Reason /><button className="btn-ghost btn-sm">Send email</button></form>
            {p.user_id && <form action={forceSignout.bind(null, p.user_id, p.email)} className="space-y-2 rounded-xl border border-line p-3"><p className="font-semibold">Sign out everywhere</p><p className="text-xs text-muted">Ends every session (e.g. lost phone). They can sign in again.</p><Reason /><button className="btn-ghost btn-sm">Sign out</button></form>}
            {p.user_id && <form action={setLocked.bind(null, p.user_id, p.email, !p.locked)} className="space-y-2 rounded-xl border border-line p-3"><p className="font-semibold">{p.locked ? "Unlock account" : "Lock account"}</p><p className="text-xs text-muted">{p.locked ? "Lets them sign in again." : "Blocks sign-in and ends their sessions until unlocked."}</p><Reason /><button className={p.locked ? "btn-primary btn-sm" : "btn-ghost btn-sm text-bad"}>{p.locked ? "Unlock" : "Lock"}</button></form>}
            {p.user_id && p.totp_enrolled && <form action={resetMfa.bind(null, p.user_id, p.email)} className="space-y-2 rounded-xl border border-line p-3"><p className="font-semibold">Reset two-factor</p><p className="text-xs text-muted">Only after checking their identity. Removes their authenticator and recovery codes and signs them out.</p><Reason /><button className="btn-ghost btn-sm text-bad">Reset two-factor</button></form>}
          </div>
        </article>
      ))}
    </div>
  );
}
