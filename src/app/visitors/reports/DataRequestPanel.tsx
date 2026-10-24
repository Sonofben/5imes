"use client";

import { useActionState } from "react";
import { findVisitorData, type DsrState } from "../actions";

const EMPTY: DsrState = { query: "", rows: [] };

/**
 * A visitor asks what the company holds about them, or asks for it to be deleted. The admin searches
 * by full email or phone; results come back to this panel only (nothing is put in the page address).
 */
export function DataRequestPanel() {
  const [state, action, pending] = useActionState(findVisitorData, EMPTY);
  return (
    <section className="card space-y-3">
      <div><h2 className="font-bold">A visitor’s data request</h2>
        <p className="text-sm text-muted">When a visitor asks what you hold about them, or asks you to delete it. Search by their full email address or phone number.</p></div>
      <form action={action} className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1"><label className="label" htmlFor="dsr-q">Email or phone</label>
          <input id="dsr-q" name="query" defaultValue={state.query} maxLength={254} className="input" autoComplete="off" /></div>
        <button name="intent" value="find" disabled={pending} className="btn-primary">Find</button>
      </form>
      {state.error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-bad">{state.error}</p>}
      {state.done && <p role="status" className="rounded-xl bg-green-50 px-3 py-2 text-sm text-ok">{state.done}</p>}
      {state.query && !state.error && !state.done && (state.rows.length === 0
        ? <p className="text-sm text-muted">No visits found for that email or phone.</p>
        : <>
            <div className="overflow-x-auto"><table className="table min-w-[640px]">
              <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Company</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>{state.rows.map((r) => <tr key={r.id}><td>{r.name}</td><td>{r.email ?? ""}</td><td>{r.phone ?? ""}</td><td>{r.company ?? ""}</td><td>{r.status}</td><td className="text-xs">{new Date(r.at).toLocaleDateString("en-GB")}</td></tr>)}</tbody>
            </table></div>
            <form action={action} onSubmit={(e) => { if (!confirm(`Erase all ${state.rows.length} visit record(s) for this person? This can’t be undone.`)) e.preventDefault(); }} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="query" value={state.query} />
              <button name="intent" value="erase" disabled={pending} className="btn-ghost text-bad">Erase this person’s details</button>
              <span className="text-xs text-muted">Visitors currently on site can’t be erased until they leave. Visit counts stay for reports.</span>
            </form>
          </>)}
    </section>
  );
}
