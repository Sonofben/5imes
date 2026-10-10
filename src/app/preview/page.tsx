import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { naira } from "@/lib/constants";

export const dynamic = "force-dynamic";

const people = [
  { initials: "TA", name: "Tomi Adeyemi", team: "Operations", mode: "Office · Victoria Island", time: "8:52 am", status: "Checked in", tone: "bg-green-50 text-ok" },
  { initials: "CO", name: "Chinedu Okafor", team: "Engineering", mode: "Home · approved", time: "9:04 am", status: "Checked in", tone: "bg-green-50 text-ok" },
  { initials: "FA", name: "Fiyin Adebayo", team: "Customer success", mode: "Overnight shift", time: "11:40 pm", status: "In · overnight", tone: "bg-[#f9efe7] text-[#8c593a]" },
  { initials: "MN", name: "Mariam Nwosu", team: "People", mode: "Office · Victoria Island", time: "—", status: "Not in yet", tone: "bg-amber-50 text-warn" },
];
const bars = [34, 48, 72, 58, 82, 64, 92, 74, 55, 68, 42, 30];

export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ panel?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { panel } = await searchParams;
  const billing = panel === "billing";

  return <main className="min-h-screen bg-[#f4f3ef] text-ink">
    <div className="mx-auto max-w-[1480px] px-4 pb-8 sm:px-6 lg:px-8">
      <header className="flex min-h-[72px] items-center justify-between gap-4 border-b border-line py-4">
        <div className="flex items-center gap-3"><Logo href="/preview"/><span className="hidden border-l border-line pl-3 text-sm font-medium text-muted sm:inline">Fieldnote Studio</span></div>
        <div className="flex items-center gap-3"><span className="hidden rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-muted sm:inline-flex">Development preview · sample data</span><Link className="btn-ghost btn-sm" href="/">Public site</Link><span className="grid h-9 w-9 place-items-center rounded-full bg-[#293d38] text-xs font-bold text-white" aria-label="Workspace admin">JA</span></div>
      </header>
      <div className="my-4 flex items-start gap-3 rounded-xl border border-[#e8ddba] bg-[#fff9e9] px-4 py-3 text-xs leading-5 text-[#725c24]"><span className="font-bold">PREVIEW</span><p>This is a static visual sample. No real staff data, sign-in, billing account or payment is connected.</p></div>
      <div className="mt-5 lg:grid lg:grid-cols-[218px_minmax(0,1fr)] lg:gap-7">
        <aside className="mb-5 hidden lg:block"><nav aria-label="Preview workspace navigation" className="sticky top-5 space-y-6 rounded-2xl border border-line bg-white p-3 shadow-sm">
          <div><p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Workspace</p><div className="space-y-1"><PreviewNav href="/preview" active={!billing} label="Today"/><PreviewNav href="/preview?panel=billing" active={billing} label="Billing"/><PreviewNav active={false} label="People"/><PreviewNav active={false} label="Reports"/></div></div>
          <div><p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Operations</p><div className="space-y-1"><PreviewNav active={false} label="Locations"/><PreviewNav active={false} label="Schedule"/><PreviewNav active={false} label="Settings"/></div></div>
        </nav></aside>
        <section className="min-w-0 space-y-6">
          <nav aria-label="Mobile preview navigation" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:hidden"><Link className={`whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-semibold ${!billing ? "bg-ink text-white" : "text-muted"}`} href="/preview">Today</Link><Link className={`whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-semibold ${billing ? "bg-ink text-white" : "text-muted"}`} href="/preview?panel=billing">Billing</Link><span className="whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm text-muted">People</span><span className="whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm text-muted">Reports</span></nav>
          {billing ? <BillingPreview/> : <TodayPreview/>}
        </section>
      </div>
    </div>
  </main>;
}

function PreviewNav({ href, active, label }: { href?: string; active: boolean; label: string }) {
  const className = `flex min-h-10 items-center rounded-xl px-3 py-2 text-sm font-medium ${active ? "bg-[#f4f3ef] text-ink" : "text-muted"}`;
  return href ? <Link href={href} aria-current={active ? "page" : undefined} className={`${className} hover:bg-[#fafbf9] hover:text-ink`}>{label}</Link> : <span aria-disabled="true" className={`${className} cursor-default opacity-60`}>{label}<span className="ml-auto text-[10px]">Preview only</span></span>;
}

function TodayPreview() {
  const stats = [{ label: "Checked in now", value: "18", foot: "of 22 active" }, { label: "At an office", value: "11", foot: "across 2 locations" }, { label: "Working from home", value: "7", foot: "approved workspaces" }, { label: "Not in yet", value: "3", foot: "scheduled today" }, { label: "Needs attention", value: "1", foot: "late arrival" }];
  return <>
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Thursday, 8 October · Workforce overview</p><h1 className="page-heading">Today</h1><p className="page-description">An illustrative view of the team’s scheduled office and approved-home workday.</p></div><span className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-xs font-medium text-muted"><span className="h-2 w-2 rounded-full bg-brand-dark"/>Sample data</span></div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">{stats.map((stat, i) => <article key={stat.label} className={`card min-w-0 p-4 ${i === 4 ? "border-[#edd6c7]" : ""}`}><p className="text-xs font-semibold leading-5 text-muted">{stat.label}</p><p className={`mt-2 text-3xl font-bold tabular-nums tracking-tight ${i === 3 ? "text-warn" : i === 4 ? "text-brand-dark" : "text-ink"}`}>{stat.value}</p><p className="mt-1 truncate text-[11px] text-muted">{stat.foot}</p></article>)}</div>
    <div className="grid gap-4 xl:grid-cols-[1.35fr_.85fr]">
      <section className="card"><div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Attendance rhythm</p><h2 className="mt-1 text-lg font-bold">Check-ins through the day</h2></div><span className="chip bg-[#e9f2ed] text-ok">22 scheduled</span></div><div className="mt-6 flex h-40 items-end gap-2 border-b border-line px-1">{bars.map((height, index) => <div key={index} className="flex h-full flex-1 items-end"><span className={`w-full rounded-t-md ${index === 6 ? "bg-brand" : "bg-[#cbd8d1]"}`} style={{ height: `${height}%` }}/></div>)}</div><div className="mt-2 flex justify-between text-[10px] text-muted"><span>7 am</span><span>9 am</span><span>11 am</span><span>1 pm</span><span>3 pm</span><span>5 pm</span></div><div className="mt-5 flex items-center gap-2 text-xs text-muted"><span className="h-2 w-2 rounded-sm bg-[#cbd8d1]"/> Check-ins <span className="ml-3 h-2 w-2 rounded-sm bg-brand"/> Late check-ins</div></section>
      <section className="card"><p className="eyebrow">Work locations</p><h2 className="mt-1 text-lg font-bold">Where the team is today</h2><div className="mt-5 space-y-5"><LocationBar label="Victoria Island office" value={11} total={22} color="bg-ink"/><LocationBar label="Approved home" value={7} total={22} color="bg-[#758f82]"/><LocationBar label="Not checked in" value={3} total={22} color="bg-[#d8b27a]"/><LocationBar label="Other / day off" value={1} total={22} color="bg-[#d9ddda]"/></div><p className="mt-5 border-t border-line pt-4 text-xs leading-5 text-muted">Location visibility follows each person’s approved work mode. Exact coordinates aren’t shown in this team overview.</p></section>
    </div>
    <section className="card overflow-hidden p-0"><div className="flex flex-wrap items-center justify-between gap-3 p-5"><div><p className="eyebrow">Team activity</p><h2 className="mt-1 text-lg font-bold">Attendance status</h2><p className="mt-1 text-xs text-muted">Open overnight check-ins remain active after midnight.</p></div><span className="rounded-lg border border-line bg-[#faf9f6] px-3 py-2 text-xs text-muted">Search people</span></div><div className="overflow-x-auto"><table className="table min-w-[720px]"><thead><tr><th>Person</th><th>Today’s schedule</th><th>Current status</th><th>First in</th><th>Exceptions</th></tr></thead><tbody>{people.map((person) => <tr key={person.initials}><td><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#ece9e2] text-[11px] font-bold text-ink">{person.initials}</span><div><p className="font-semibold">{person.name}</p><p className="text-xs text-muted">{person.team}</p></div></div></td><td className="text-muted">{person.mode.startsWith("Overnight") ? "Overnight" : "Office / home"}</td><td><span className={`chip ${person.tone}`}>{person.status} · {person.mode}</span></td><td className="tabular-nums">{person.time}</td><td className="text-xs text-muted">{person.status === "Not in yet" ? "Check-in outstanding" : "—"}</td></tr>)}</tbody></table></div><p className="border-t border-line px-5 py-3 text-xs text-muted">Showing a sample of 22 team members</p></section>
  </>;
}

function LocationBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  return <div><div className="mb-1.5 flex justify-between gap-3 text-xs"><span className="font-medium">{label}</span><span className="tabular-nums text-muted">{value}</span></div><div className="h-2 overflow-hidden rounded-full bg-[#f0f0ec]"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.round(value / total * 100)}%` }}/></div></div>;
}

function BillingPreview() {
  return <>
    <div><p className="eyebrow">Organization</p><h1 className="page-heading">Billing</h1><p className="page-description">A predictable per-seat subscription, with the renewal and team capacity shown clearly.</p></div>
    <div className="rounded-xl border border-[#e8ddba] bg-[#fff9e9] px-4 py-3 text-xs leading-5 text-[#725c24]">Illustrative only · these sample amounts do not start a checkout or represent a live company.</div>
    <section className="card grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"><div><p className="eyebrow">Current subscription</p><h2 className="mt-1 text-lg font-bold">Pro · renews every 6 months</h2><p className="mt-1 text-sm text-muted">Current paid period ends 8 April 2027.</p><p className="mt-2 text-xs text-muted">Next charge: 10 paid seats × ₦500 × 6 months.</p></div><div className="rounded-xl bg-paper px-5 py-4 lg:min-w-40 lg:text-right"><p className="eyebrow">Active + invited</p><p className="mt-1 text-3xl font-bold tabular-nums">8</p><p className="text-xs text-muted">10 paid seats</p></div></section>
    <section className="card"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">Mid-cycle seat addition</p><h2 className="mt-1 text-lg font-bold">Add seats now</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-muted">Pay only for added seats, prorated by the exact time remaining in the current term. Your renewal date stays the same.</p></div><span className="chip bg-green-50 text-ok">No long-term discount</span></div><div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><div><p className="label">New total paid seats</p><div className="input flex items-center justify-between"><span>12</span><span className="text-xs text-muted">seats</span></div><p className="mt-1 text-xs text-muted">Current paid capacity: 10 · active + invited: 8</p></div><div className="rounded-lg bg-paper px-4 py-3 text-right"><p className="text-xs text-muted">Due now · 2 added seats</p><p className="text-xl font-extrabold tabular-nums">₦1,000</p></div></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><p className="max-w-xl text-xs leading-5 text-muted">Next renewal: 12 seats × ₦500 × 6 months = ₦36,000. Proration is recalculated on the server to the nearest kobo; Paystack shows the final charge.</p><button type="button" disabled className="btn-brand">Preview only · no payment</button></div></section>
    <section className="card"><p className="eyebrow">Upfront per-seat examples · Pro</p><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{[{ name: "Monthly", months: 1 }, { name: "Quarterly", months: 3 }, { name: "Biannually", months: 6 }, { name: "Yearly", months: 12 }].map((term) => <div key={term.name} className="rounded-xl border border-line bg-[#faf9f6] px-3 py-3"><p className="text-xs text-muted">{term.name} · {term.months} months</p><p className="mt-1 font-bold tabular-nums">{naira(500 * term.months)}</p></div>)}</div></section>
  </>;
}
