import { requireConsole, can, fmtDateTime, ROLE_LABELS, ROLE_HELP, type ConsoleRole } from "@/lib/console";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { friendly } from "@/lib/errors";
import { Reason } from "../Reason";
import { teamAdd, teamSetRole, teamRemove } from "../actions";
import { lookup } from "@/lib/schemas";

export const dynamic = "force-dynamic";

const ROLES = Object.keys(ROLE_LABELS) as ConsoleRole[];

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, role, user } = await requireConsole();
  const { data, error } = await supabase.rpc("console_team");
  const team = (data ?? []);
  const edit = can.ownerOnly(role);
  return (
    <div className="space-y-6">
      <div><h1 className="page-heading">Global Admin team</h1><p className="page-description">Kora Forge people who can open Global Admin. Everyone needs two-factor sign-in. {edit ? "" : "Only a Global admin can change the team."}</p></div>
      <Flash msg={readFlash(sp).msg} error={readFlash(sp).error ?? (error ? friendly(error, "console.team") : undefined)} />
      <ul className="grid gap-2 text-sm sm:grid-cols-2">{ROLES.map((r) => <li key={r} className="card p-3"><b>{ROLE_LABELS[r]}</b><span className="text-muted"> — {ROLE_HELP[r]}</span></li>)}</ul>
      <div className="card overflow-x-auto p-0"><table className="table min-w-[760px]">
        <thead><tr><th>Person</th><th>Role</th><th>Two-factor</th><th>Last sign-in</th>{edit && <th>Change</th>}</tr></thead>
        <tbody>{team.map((m) => <tr key={m.user_id}>
          <td><div className="font-semibold">{m.email}</div><div className="text-xs text-muted">Added {fmtDateTime(m.created_at)}{m.user_id === user.id ? " · you" : ""}</div></td>
          <td>{lookup(ROLE_LABELS, m.role, m.role)}</td>
          <td>{m.totp_enrolled ? <span className="chip bg-green-50 text-ok">On</span> : <span className="chip bg-amber-50 text-warn">Not set up</span>}</td>
          <td className="text-xs">{fmtDateTime(m.last_sign_in_at)}</td>
          {edit && <td><div className="flex flex-col gap-2">
            <form action={teamSetRole.bind(null, m.user_id)} className="flex flex-wrap gap-1"><select name="role" defaultValue={m.role} className="input min-h-9 py-1 text-xs" aria-label="Role">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select><input name="reason" required minLength={5} placeholder="Reason" className="input min-h-9 w-36 py-1 text-xs" aria-label="Reason" /><button className="btn-ghost btn-sm">Save</button></form>
            <form action={teamRemove.bind(null, m.user_id)} className="flex flex-wrap gap-1"><input name="reason" required minLength={5} placeholder="Reason for removing" className="input min-h-9 w-48 py-1 text-xs" aria-label="Reason for removing" /><button className="btn-ghost btn-sm text-bad">Remove</button></form>
          </div></td>}
        </tr>)}</tbody>
      </table></div>
      {edit && <form action={teamAdd} className="card max-w-xl space-y-3"><h2 className="font-bold">Add someone</h2>
        <p className="text-xs text-muted">If they don’t have a 5ime login yet, they get an invitation email to set a password.</p>
        <input name="email" type="email" required placeholder="name@koraforge.com" className="input" aria-label="Email" />
        <select name="role" defaultValue="viewer" className="input" aria-label="Role">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
        <Reason /><button className="btn-primary">Add to team</button></form>}
    </div>
  );
}
