import Link from "next/link";
import { Logo } from "@/components/Logo";
import { BRAND, PLANS, TRIAL_DAYS, naira } from "@/lib/constants";

const cycles = [
  { label: "Monthly", months: 1 },
  { label: "Quarterly", months: 3 },
  { label: "Biannually", months: 6 },
  { label: "Yearly", months: 12 },
];

const steps = [
  { n: "01", title: "Set up your workplace", text: "Add office locations, work hours and the team’s weekly office/home schedule." },
  { n: "02", title: "Approve home locations", text: "Team members request their home location. An admin reviews it before it can be used." },
  { n: "03", title: "See a clear picture", text: "GPS check-ins are compared with the right place, workday and shift—even overnight." },
];

const features = [
  { mark: "01", title: "One view of the workday", text: "See who is in, working from home, yet to check in, or needs attention." },
  { mark: "02", title: "Office and home by schedule", text: "Match check-ins to an approved office or approved home on the scheduled day—not just any location pin." },
  { mark: "03", title: "Less manual follow-up", text: "Late arrivals, early departures and attendance exceptions are called out automatically." },
  { mark: "04", title: "Respectful location controls", text: "Home and precise attendance coordinates are protected from ordinary manager views." },
  { mark: "05", title: "Shifts that cross midnight", text: "An open shift stays visible after midnight and its hours are reported across the correct dates." },
  { mark: "06", title: "A clean paper trail", text: "Review attendance history and export reports to CSV for your team’s own records." },
];

const team = [
  { initials: "TA", name: "Tomi A.", mode: "Office · Victoria Island", time: "8:52 am", tone: "bg-[#f4e5dc] text-[#8f462c]" },
  { initials: "CO", name: "Chinedu O.", mode: "Home · approved", time: "9:04 am", tone: "bg-[#e3ece8] text-[#315f50]" },
  { initials: "FA", name: "Fiyin A.", mode: "On an overnight shift", time: "11:40 pm", tone: "bg-[#e7e8f2] text-[#4d527f]" },
];

export default function Home() {
  return (
    <main className="overflow-hidden bg-[#faf9f6]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <nav aria-label="Main navigation" className="flex items-center gap-2 sm:gap-4">
          <a href="#how" className="hidden px-3 py-2 text-sm font-medium text-muted hover:text-ink sm:inline-flex">How it works</a>
          <a href="#pricing" className="hidden px-3 py-2 text-sm font-medium text-muted hover:text-ink sm:inline-flex">Pricing</a>
          <Link href="/login" className="btn-primary btn-sm">Sign in</Link>
        </nav>
      </header>

      <section className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 pb-16 pt-8 sm:px-8 sm:pb-24 sm:pt-14 lg:grid-cols-[1.02fr_.98fr] lg:gap-14">
        <div className="relative z-10 max-w-2xl">
          <p className="eyebrow mb-5 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-brand" /> Attendance for scheduled workplaces</p>
          <h1 className="max-w-[12ch] text-[2.8rem] font-bold leading-[1.04] tracking-[-0.045em] sm:text-6xl lg:text-[4.15rem]">Know your team is where they planned to be.</h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-muted sm:text-lg sm:leading-8">{BRAND.name} lets people check in by GPS only at an approved office or their approved home on scheduled days. Managers get a clear view of attendance without allowing check-ins from any location.</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/login" className="btn-brand px-5">Start a {TRIAL_DAYS}-day Pro trial <span aria-hidden>→</span></Link>
            <a href="#how" className="btn-ghost">See how it works</a>
          </div>
          <p className="mt-4 text-sm text-muted">No card to start. Plans from <strong className="font-semibold text-ink">{naira(PLANS.basic.pricePerSeat)} per seat per month.</strong></p>
          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-5 text-xs text-muted"><span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-ok" /> Office + approved home</span><span>Company email sign-in</span><span>Built for local time zones</span></div>
        </div>

        <div className="relative mx-auto w-full max-w-[600px] lg:mr-0">
          <div aria-hidden="true" className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#edcfc2]/50 blur-3xl" />
          <div aria-hidden="true" className="absolute -bottom-14 -left-10 h-52 w-52 rounded-full bg-[#dce8e1]/80 blur-3xl" />
          <section aria-label="Illustrative 5ime attendance workspace" className="relative overflow-hidden rounded-[1.65rem] border border-[#deded7] bg-white shadow-[0_24px_70px_rgba(32,39,37,0.12)]">
            <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-6"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-dark text-sm font-black text-white">5</span><div><p className="text-sm font-bold">Today at Fieldnote</p><p className="text-[11px] text-muted">Thursday · Lagos</p></div></div><span className="chip bg-[#f9eee9] text-brand-dark">Illustrative demo</span></div>
            <div className="p-5 sm:p-6">
              <div className="flex items-end justify-between gap-4"><div><p className="eyebrow">Attendance overview</p><h2 className="mt-1 text-2xl font-bold tracking-tight">A clear start to the day.</h2></div><p className="hidden text-right text-xs leading-5 text-muted sm:block">Illustrative workspace<br/>Sample names and activity</p></div>
              <div className="mt-5 grid grid-cols-3 gap-2.5 sm:gap-3"><div className="rounded-xl bg-[#f7f7f3] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Checked in</p><p className="mt-1 text-2xl font-bold tabular-nums">18<span className="text-sm font-medium text-muted">/22</span></p></div><div className="rounded-xl bg-[#f7f7f3] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted">At office</p><p className="mt-1 text-2xl font-bold tabular-nums">11</p></div><div className="rounded-xl bg-[#f7f7f3] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted">At home</p><p className="mt-1 text-2xl font-bold tabular-nums">7</p></div></div>
              <div className="mt-5 flex items-center justify-between"><div><p className="text-sm font-bold">Team activity</p><p className="text-xs text-muted">Sample activity</p></div><span className="text-xs font-medium text-muted">Example</span></div>
              <ul className="mt-2 divide-y divide-line">
                {team.map((person) => <li key={person.initials} className="flex items-center gap-3 py-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-bold ${person.tone}`}>{person.initials}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{person.name}</p><p className="truncate text-xs text-muted">{person.mode}</p></div><span className="shrink-0 text-xs tabular-nums text-muted">{person.time}</span></li>)}
              </ul>
              <div className="mt-2 flex items-center justify-between rounded-xl border border-[#eadfd7] bg-[#fcf8f4] px-3.5 py-3"><p className="text-xs font-medium text-[#755343]">One overnight shift is still open</p><span className="text-xs font-bold text-[#755343]">11:40 pm · in</span></div>
            </div>
            <div className="flex items-center justify-between border-t border-line bg-[#faf9f6] px-5 py-3 text-[10px] text-muted sm:px-6"><span>Sample view · organization time zone</span><span>Not connected to live data</span></div>
          </section>
          <div className="relative mt-3 flex justify-end"><span className="rounded-full border border-line bg-white px-3 py-1.5 text-[11px] font-medium text-muted shadow-sm">A little more clarity. A lot less chasing.</span></div>
        </div>
      </section>

      <section id="how" className="border-y border-line bg-white">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="max-w-xl"><p className="eyebrow">Simple by design</p><h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">A better attendance routine in three steps.</h2></div>
          <div className="mt-9 grid gap-7 md:grid-cols-3 md:gap-10">{steps.map((step) => <article key={step.n} className="border-t-2 border-brand pt-4"><p className="text-xs font-bold tracking-[0.12em] text-brand-dark">{step.n}</p><h3 className="mt-3 text-lg font-bold">{step.title}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-muted">{step.text}</p></article>)}</div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-5"><div className="max-w-2xl"><p className="eyebrow">Useful, not noisy</p><h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">The details that make attendance clear.</h2></div><p className="max-w-md text-sm leading-6 text-muted">Designed around clear schedules, consistent attendance rules and a respectful approach to people’s location data.</p></div>
        <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{features.map((feature) => <article key={feature.mark} className="rounded-2xl border border-line bg-white p-5 transition-colors hover:border-[#cdd5d0]"><p className="text-[11px] font-bold tracking-[0.12em] text-brand-dark">{feature.mark}</p><h3 className="mt-3 font-bold">{feature.title}</h3><p className="mt-1.5 text-sm leading-6 text-muted">{feature.text}</p></article>)}</div>
      </section>

      <section id="pricing" className="border-y border-line bg-white">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="max-w-2xl"><p className="eyebrow">Transparent per-seat pricing</p><h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Simple plans. No long-term discount math.</h2><p className="mt-3 text-sm leading-6 text-muted">Pick the term that fits your budget. Active and invited team members both use a seat. Add seats mid-term and pay only for the remaining time.</p></div>
          <p className="mt-4 text-sm text-muted">Every organization starts with the {TRIAL_DAYS}-day Pro trial, then chooses Basic or Pro.</p>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">{Object.values(PLANS).map((plan) => <article key={plan.id} className={`rounded-2xl border bg-[#faf9f6] p-5 sm:p-6 ${plan.id === "pro" ? "border-ink" : "border-line"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">{plan.id === "basic" ? "For one location" : "For growing teams"}</p><h3 className="mt-1 text-2xl font-bold">{plan.name}</h3><p className="mt-1 max-w-md text-sm text-muted">{plan.blurb}</p></div><p className="text-right"><span className="text-3xl font-extrabold tabular-nums">{naira(plan.pricePerSeat)}</span><span className="block text-xs text-muted">per seat / month</span></p></div>
            <ul className="mt-5 grid gap-2 sm:grid-cols-2">{plan.features.map((feature) => <li key={feature} className="flex gap-2 text-sm"><span aria-hidden className="font-bold text-ok">✓</span><span>{feature}</span></li>)}</ul>
            <div className="mt-5 border-t border-line pt-4"><p className="eyebrow">Upfront price per seat</p><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{cycles.map((cycle) => <div key={cycle.label} className="rounded-xl border border-line bg-white px-3 py-2.5"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{cycle.label}</p><p className="mt-1 text-sm font-bold tabular-nums">{naira(plan.pricePerSeat * cycle.months)}</p><p className="text-[10px] text-muted">{cycle.months} month{cycle.months === 1 ? "" : "s"}</p></div>)}</div></div>
            <Link href="/login" className={`${plan.id === "pro" ? "btn-brand" : "btn-primary"} mt-5 w-full`}>{plan.id === "pro" ? "Start Pro trial" : "Start trial · choose Basic after"}</Link>
          </article>)}</div>
          <p className="mt-5 text-xs leading-5 text-muted">For example, 10 Basic seats are ₦2,500 monthly or ₦7,500 quarterly. Biannually means 6 months (₦15,000 for 10 Basic seats); yearly means 12 months (₦30,000). Totals are seats × per-seat monthly price × months. Paystack handles recurring renewals after checkout; cancel any time and retain access through the paid term.</p>
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-xs text-muted sm:px-8"><Logo /><span>© {new Date().getFullYear()} {BRAND.name}. {BRAND.tagline}</span><Link href="/login" className="font-semibold text-ink hover:text-brand-dark">Sign in to your workspace</Link></footer>
    </main>
  );
}
