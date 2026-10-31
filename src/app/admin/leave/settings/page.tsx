import Link from "next/link";
import { requireMember } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { PlanLock } from "@/components/PlanLock";
import { LeaveOverview, parseOrNull } from "@/lib/jsonShapes";
import { fmtDays } from "@/lib/leave";
import { addLeaveRule, bulkAllowance, importAllowances, importStaffDetails, removeLeaveRule, saveLeaveType, saveLeaveYear } from "../actions";

export const dynamic = "force-dynamic";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
type LeaveType = { id: string; code: string | null; name: string; paid: boolean; default_days: number | null; counts_weekends: boolean; needs_approval: boolean;
  document_after_days: number | null; carry_mode: string; carry_max: number | null; carry_expiry_months: number | null; active: boolean };

/** Leave types, the leave year, group rules, allowances (bulk and import) and staff details. Admins only. */
export default async function LeaveSettingsPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string; type?: string }> }) {
  const sp = await searchParams;
  const { supabase, org } = await requireMember({ admin: true });
  const [{ data: typesRaw }, { data: rules }, { data: pro }, { data: settings }] = await Promise.all([
    supabase.from("leave_types").select("id,code,name,paid,default_days,counts_weekends,needs_approval,document_after_days,carry_mode,carry_max,carry_expiry_months,active").eq("org_id", org.id).order("sort").order("name"),
    supabase.from("leave_rules").select("id,leave_type_id,team,role,min_years,days").eq("org_id", org.id).order("created_at"),
    supabase.rpc("org_has_pro", { p_org: org.id }),
    supabase.from("organizations").select("leave_year_mode,leave_year_start_month,leave_prorate").eq("id", org.id).single(),
  ]);
  const types = (typesRaw ?? []) as LeaveType[];
  const shown = pro ? types : types.filter((t) => t.code);
  const chosen = shown.find((t) => t.id === sp.type) ?? shown[0];
  const { data: overviewRaw } = chosen && pro ? await supabase.rpc("admin_leave_overview", { p_type: chosen.id }) : { data: null };
  const overview = parseOrNull(LeaveOverview, overviewRaw, "admin/leave/overview") ?? [];
  const typeName = new Map(types.map((t) => [t.id, t.name]));

  return (
    <div className="space-y-6">
      <div><Link href="/admin/leave" className="text-sm text-muted underline">Back to leave</Link><h1 className="page-heading mt-1">Leave types and allowances</h1>
        <p className="page-description">Set it once for the whole company, then use rules, bulk changes or a spreadsheet instead of editing people one by one.</p></div>
      <Flash {...readFlash(sp)} />

      <form action={saveLeaveYear} className="card space-y-3">
        <h2 className="font-bold">Leave year</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="ly-mode">The leave year runs</label><select id="ly-mode" name="mode" defaultValue={settings?.leave_year_mode ?? "calendar"} className="input">
            <option value="calendar">January to December</option><option value="financial">From a month of your choice (financial year)</option><option value="anniversary">From each person’s start date (anniversary)</option></select></div>
          <div><label className="label" htmlFor="ly-month">Financial year starts in</label><select id="ly-month" name="start_month" defaultValue={settings?.leave_year_start_month ?? 1} className="input">{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
        </div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="prorate" defaultChecked={settings?.leave_prorate ?? true} className="mt-0.5 h-4 w-4" /> People who join during the year get a share of the year’s days</label>
        <div className="flex justify-end"><button className="btn-primary">Save</button></div>
      </form>

      <section className="space-y-3">
        <h2 className="font-bold">Leave types</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {shown.map((t) => <TypeForm key={t.id} t={t} pro={!!pro} />)}
          {pro ? <TypeForm pro /> : <PlanLock compact isAdmin plan="Pro" title="Add your own leave types" points={["Study, exam, pilgrimage, birthday or any leave in your policy.", "Paid or unpaid, documents, approval and carry-over per type."]} />}
        </div>
      </section>

      {pro ? <>
        <section className="card space-y-3">
          <div><h2 className="font-bold">Rules for groups</h2><p className="text-sm text-muted">Give a team, a role or people with enough years of service a different allowance. If several rules match someone, the highest wins. Add start dates below for years of service.</p></div>
          {(rules ?? []).length > 0 && <ul className="divide-y divide-line text-sm">{(rules ?? []).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><b>{typeName.get(r.leave_type_id)}</b>: {fmtDays(Number(r.days))} for {[r.team && `team ${r.team}`, r.role && `${r.role}s`, r.min_years != null && `${r.min_years}+ years of service`].filter(Boolean).join(", ")}</span>
              <form action={removeLeaveRule.bind(null, r.id)}><button className="btn-ghost btn-sm text-bad">Remove</button></form>
            </li>))}</ul>}
          <form action={addLeaveRule} className="grid gap-3 sm:grid-cols-5 sm:items-end">
            <div><label className="label" htmlFor="r-type">Leave type</label><select id="r-type" name="type" className="input">{shown.filter((t) => t.default_days != null).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
            <div><label className="label" htmlFor="r-team">Team (optional)</label><input id="r-team" name="team" maxLength={60} className="input" /></div>
            <div><label className="label" htmlFor="r-role">Role (optional)</label><select id="r-role" name="role" className="input"><option value="">Any</option><option value="staff">Staff</option><option value="manager">Managers</option><option value="admin">Admins</option></select></div>
            <div><label className="label" htmlFor="r-years">Years of service (optional)</label><input id="r-years" name="min_years" type="number" min={0} max={60} step="0.5" className="input" /></div>
            <div><label className="label" htmlFor="r-days">Days</label><div className="flex gap-2"><input id="r-days" name="days" type="number" min={0} max={366} step="0.5" required className="input" /><button className="btn-primary">Add</button></div></div>
          </form>
        </section>

        {chosen && <section className="card space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="font-bold">Allowances this leave year</h2><p className="text-sm text-muted">Tick people and give them all the same number of days, or reset them to the default and rules.</p></div>
            <form className="flex items-end gap-2"><div><label className="label" htmlFor="a-type">Leave type</label><select id="a-type" name="type" defaultValue={chosen.id} className="input">{shown.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div><button className="btn-ghost">Show</button></form>
          </div>
          <form action={bulkAllowance.bind(null, chosen.id)} className="space-y-3">
            <div className="overflow-x-auto"><table className="table min-w-[640px]">
              <thead><tr><th className="w-10"><span className="sr-only">Select</span></th><th>Person</th><th>Allowance</th><th>Taken</th><th>Waiting</th><th>Left</th></tr></thead>
              <tbody>{overview.map((p) => <tr key={p.member_id}>
                <td><input type="checkbox" name="member" value={p.member_id} aria-label={`Select ${p.member}`} className="h-4 w-4" /></td>
                <td><b>{p.member}</b>{p.team ? <span className="block text-xs text-muted">{p.team}</span> : null}</td>
                <td>{p.entitlement == null ? "No limit" : fmtDays(p.entitlement)}{p.carried > 0 ? <span className="block text-xs text-muted">+ {fmtDays(p.carried)} carried</span> : null}{p.override && <span className="chip ml-1 bg-paper text-muted">Set by hand</span>}</td>
                <td>{fmtDays(p.used)}</td><td>{fmtDays(p.pending)}</td><td><b>{p.remaining == null ? "No limit" : fmtDays(p.remaining)}</b></td>
              </tr>)}</tbody>
            </table></div>
            <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-end">
              <div><label className="label" htmlFor="b-days">Days for the ticked people</label><input id="b-days" name="days" type="number" min={0} max={366} step="0.5" className="input" /></div>
              <div><label className="label" htmlFor="b-note">Why (optional)</label><input id="b-note" name="note" maxLength={200} className="input" placeholder="e.g. Agreed in contract" /></div>
              <label className="flex items-center gap-2 pb-3 text-sm"><input type="checkbox" name="reset" className="h-4 w-4" /> Reset to default</label>
              <button className="btn-primary">Apply</button>
            </div>
          </form>
        </section>}

        <form action={importAllowances} className="card space-y-3">
          <div><h2 className="font-bold">Import allowances from a spreadsheet</h2><p className="text-sm text-muted">Columns: email, leave type, days. For this leave year. Useful when you already track balances elsewhere.</p></div>
          <textarea name="csv" rows={4} className="input font-mono text-xs" placeholder={`email,leave type,days\nada@${org.domain},Annual leave,18\ntunde@${org.domain},Annual leave,25`} />
          <div className="flex justify-end"><button className="btn-primary">Import</button></div>
        </form>
      </> : <PlanLock isAdmin plan="Pro" title="Rules, bulk allowances and carry-over are part of Pro and Premium" points={[
        "Rules by team, role or years of service, applied automatically.",
        "Tick many people and set their allowance at once, or import a spreadsheet.",
        "Carry unused days into the next year, with a limit and a use-by date.",
      ]} />}

      <form action={importStaffDetails} className="card space-y-3">
        <div><h2 className="font-bold">Start dates and birthdays</h2><p className="text-sm text-muted">Columns: email, start date (2021-03-01 or 01/03/2021), birthday (day/month, e.g. 14/03). Start dates drive years of service and work anniversaries; birthdays are only seen by the person and admins. Leave a cell empty to keep what’s there.</p></div>
        <textarea name="csv" rows={4} className="input font-mono text-xs" placeholder={`email,start date,birthday\nada@${org.domain},2021-03-01,14/03\ntunde@${org.domain},15/06/2019,02/11`} />
        <div className="flex justify-end"><button className="btn-primary">Save details</button></div>
      </form>
    </div>
  );
}

function TypeForm({ t, pro }: { t?: LeaveType; pro: boolean }) {
  const isNew = !t;
  const locked = !pro;
  return (
    <form action={saveLeaveType.bind(null, t?.id ?? null)} className={`card space-y-3 ${isNew ? "border-dashed" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold">{isNew ? "Add a leave type" : t.name}</h3>
        {!isNew && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={t.active} className="h-4 w-4" /> On</label>}
        {isNew && <input type="hidden" name="active" value="on" />}
      </div>
      {!locked && <div><label className="label" htmlFor={`t-name-${t?.id ?? "new"}`}>Name</label><input id={`t-name-${t?.id ?? "new"}`} name="name" required minLength={2} maxLength={60} defaultValue={t?.name ?? ""} className="input" placeholder="e.g. Study leave" /></div>}
      {locked && <input type="hidden" name="name" value={t?.name ?? ""} />}
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor={`t-days-${t?.id ?? "new"}`}>Days a year</label><input id={`t-days-${t?.id ?? "new"}`} name="days" type="number" min={0} max={366} step="0.5" defaultValue={t?.default_days ?? ""} className="input" /></div>
        <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" name="unlimited" defaultChecked={!!t && t.default_days == null} className="h-4 w-4" /> No limit</label>
      </div>
      {!locked && <>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="paid" defaultChecked={t?.paid ?? true} className="h-4 w-4" /> Paid</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="weekends" defaultChecked={t?.counts_weekends ?? false} className="h-4 w-4" /> Counts every calendar day</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="approval" value="on" defaultChecked={t?.needs_approval ?? true} className="h-4 w-4" /> Needs approval</label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="needs_doc" defaultChecked={t?.document_after_days != null} className="h-4 w-4" /> Needs a document</label>
          <div><label className="label" htmlFor={`t-doc-${t?.id ?? "new"}`}>when longer than (days)</label><input id={`t-doc-${t?.id ?? "new"}`} name="doc_after" type="number" min={0} max={366} defaultValue={t?.document_after_days ?? 2} className="input" /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label" htmlFor={`t-carry-${t?.id ?? "new"}`}>Unused days</label><select id={`t-carry-${t?.id ?? "new"}`} name="carry" defaultValue={t?.carry_mode ?? "none"} className="input"><option value="none">Are lost</option><option value="limited">Carry over, up to</option><option value="all">All carry over</option></select></div>
          <div><label className="label" htmlFor={`t-cmax-${t?.id ?? "new"}`}>Max days</label><input id={`t-cmax-${t?.id ?? "new"}`} name="carry_max" type="number" min={0} max={366} step="0.5" defaultValue={t?.carry_max ?? ""} className="input" /></div>
          <div><label className="label" htmlFor={`t-cexp-${t?.id ?? "new"}`}>Use within (months)</label><input id={`t-cexp-${t?.id ?? "new"}`} name="carry_expiry" type="number" min={1} max={12} defaultValue={t?.carry_expiry_months ?? ""} className="input" placeholder="Any time" /></div>
        </div>
      </>}
      {/* The approval box is a checkbox: send "off" when it's unticked. */}
      {!locked && <input type="hidden" name="approval" value="off" />}
      <div className="flex justify-end"><button className="btn-primary btn-sm">{isNew ? "Add" : "Save"}</button></div>
    </form>
  );
}
