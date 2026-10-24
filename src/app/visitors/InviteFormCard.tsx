/** The invitation form, also used on the staff screen (without the host choice). */
export function InviteFormCard({ action, offices, people, meId, today }: {
  action: (fd: FormData) => Promise<void>; offices: { id: string; name: string }[];
  people?: { id: string; full_name: string | null; email: string; team: string | null }[]; meId: string; today: string;
}) {
  return (
    <form action={action} className="card max-w-2xl space-y-4">
      <div><h2 className="font-bold">Invite a visitor</h2><p className="text-sm text-muted">With an email address, they get the date, office address and map, their code, and an “I’ve arrived” link to check in when they get here.</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="v-name">Visitor’s full name</label><input id="v-name" name="name" required maxLength={120} className="input" /></div>
        <div><label className="label" htmlFor="v-email">Email (to send the pass)</label><input id="v-email" name="email" type="email" maxLength={254} className="input" /></div>
        <div><label className="label" htmlFor="v-phone">Phone</label><input id="v-phone" name="phone" type="tel" maxLength={30} className="input" /></div>
        <div><label className="label" htmlFor="v-company">Company</label><input id="v-company" name="company" maxLength={120} className="input" /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="v-purpose">Purpose</label><input id="v-purpose" name="purpose" maxLength={200} className="input" placeholder="e.g. Contract meeting" /></div>
        <div><label className="label" htmlFor="v-date">Date</label><input id="v-date" name="date" type="date" min={today} defaultValue={today} required className="input" /></div>
        <div><label className="label" htmlFor="v-time">Time</label><input id="v-time" name="time" type="time" defaultValue="10:00" required className="input" /></div>
        <div><label className="label" htmlFor="v-office">Office</label><select id="v-office" name="location" className="input">{offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
        {people && <div><label className="label" htmlFor="v-host">Host</label><select id="v-host" name="host" defaultValue={meId} className="input">{people.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}{p.team ? ` · ${p.team}` : ""}</option>)}</select></div>}
      </div>
      <button className="btn-primary">Send invitation</button>
    </form>
  );
}

