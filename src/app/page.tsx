import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { BRAND, naira } from "@/lib/constants";
import { loadPublicPlans } from "@/lib/plans";

// Rendered per request (see the CSP note in app/layout.tsx); prices come from Global Admin.

const cycles = [
  { label: "Monthly", months: 1 },
  { label: "Quarterly", months: 3 },
  { label: "Biannually", months: 6 },
  { label: "Yearly", months: 12 },
];

const attendanceSteps = [
  { n: "01", title: "Set up your workplace", text: "Add your offices on a map, set working hours and the team’s weekly office/home schedule. Invite staff by email." },
  { n: "02", title: "Approve home locations", text: "Staff request their home location once. An admin reviews it before it can ever be used for a check-in." },
  { n: "03", title: "Staff check in by GPS", text: "From any phone browser — no app to install. A check-in only counts at the right place on the right day." },
];

const attendanceFeatures = [
  { title: "One view of the workday", text: "Who is in, who is working from home, who hasn’t checked in yet and who needs attention — live." },
  { title: "Office and home, by schedule", text: "Check-ins are matched to an approved office or approved home on the scheduled day, not just any location pin." },
  { title: "Lateness without chasing", text: "Late arrivals and early departures are flagged against your working hours and grace period automatically." },
  { title: "Working elsewhere, approved", text: "Client site or field day? Staff ask for a one-off location; their line manager approves it in a tap." },
  { title: "Corrections with a trail", text: "Forgot to check out? Staff request a correction, a manager decides, and every change is recorded." },
  { title: "Shifts that cross midnight", text: "An open shift stays visible after midnight and its hours land on the correct dates in reports." },
  { title: "Branches and teams", text: "Unlimited offices on Pro, a check-in radius per location, per-person schedules and managers by team." },
  { title: "Reports you own", text: "Attendance history and lateness by person and period, exported to CSV for payroll or HR." },
];

const visitorFlow = [
  { who: "Invited visitor", steps: ["Gets an email with the date, office address, map and their code", "Arrives and taps “I’ve arrived” — the code is already filled in", "Waits a moment; their phone shows “You’re in” when reception admits them"] },
  { who: "Walk-in visitor", steps: ["Scans the QR poster at reception with their phone camera", "Fills in a short form — no app, no account", "Reception admits them and the host is told"] },
];

const visitorFeatures = [
  { title: "Reception desk", text: "One screen for the waiting queue, today’s expected visitors and who’s on site. Admit or turn away in a tap." },
  { title: "QR poster per office", text: "A printable poster with a private link. Replace the link any time and the old poster stops working." },
  { title: "Host alerts", text: "The person being visited gets an email the moment their visitor is let in." },
  { title: "Reception access, not admin", text: "Give reception staff the visitor desk without showing them attendance, reports or settings." },
  { title: "Who’s on site, for fire drills", text: "A printable list of staff checked in and visitors signed in, per office, with a tick-box column." },
  { title: "Blocklist", text: "Matching name, email or phone is stopped — politely — wherever they try to sign in." },
  { title: "Optional reception tablet", text: "For visitors without a smartphone: a tablet at reception with large buttons, badge printing and an optional photo." },
  { title: "Reports and audit trail", text: "Visitor numbers, busiest days and reasons for visits, plus a record of every action on visitor data." },
];

const privacy = [
  { title: "Your company only", text: "Every company’s data is separated in the database itself and checked by automated tests on every release." },
  { title: "Locations kept private", text: "Home addresses and exact check-in coordinates are hidden from ordinary manager views." },
  { title: "Two-factor for admins", text: "Admins confirm sign-in with an authenticator app; sensitive actions are rate-limited." },
  { title: "Visitor data, minimised", text: "A privacy notice visitors accept, automatic deletion after your retention period, and data requests handled in minutes (NDPA)." },
];

const roles = [
  { role: "Owners & HR", text: "Set the rules once: offices, hours, schedules, plans and who is an admin." },
  { role: "Managers", text: "See their team’s day, approve requests and corrections, export reports." },
  { role: "Staff", text: "Check in and out from their phone, request home or field locations, fix mistakes." },
  { role: "Reception", text: "Run the visitor desk: admit, turn away, sign out, print the on-site list." },
  { role: "Visitors", text: "Check in from their own phone in under a minute. Nothing to install." },
];

const faqs = [
  { q: "Do staff need to install an app?", a: "No. 5ime runs in the phone’s browser and can be added to the home screen like an app. Staff sign in with their company email." },
  { q: "Can someone check in from anywhere?", a: "No. A check-in only counts at an approved office or the person’s approved home, on the day their schedule says. Weak GPS signals are flagged for admins." },
  { q: "Do visitors need an account?", a: "No. Invited visitors use the link in their invitation email; walk-ins scan the poster at reception. Neither needs an app or a password." },
  { q: "What if a visitor has no smartphone?", a: "Reception can sign them in from the desk, or you can add a reception tablet where they type their details." },
  { q: "How does billing work?", a: "You pay per seat for the term you choose — monthly, quarterly, every six months or yearly — by card, bank transfer or USSD through Paystack. Nothing renews automatically; we remind you before your term ends." },
  { q: "Can we try it first?", a: "Yes. Every company starts with a free trial that includes visitor management. No card is needed to start." },
  { q: "Can we make it look like our company?", a: "Yes. Your staff get a sign-in page at your own company link with your logo and colours, and visitors see your company name." },
  { q: "Who owns the data?", a: "You do. Export attendance and visitor logs to CSV at any time. Visitor details are deleted automatically after the retention period you set." },
];

const team = [
  { initials: "TA", name: "Tomi A.", mode: "Office · Victoria Island", time: "8:52 am", tone: "bg-[#f4e5dc] text-[#8f462c]" },
  { initials: "CO", name: "Chinedu O.", mode: "Home · approved", time: "9:04 am", tone: "bg-[#e3ece8] text-[#315f50]" },
  { initials: "FA", name: "Fiyin A.", mode: "On an overnight shift", time: "11:40 pm", tone: "bg-[#e7e8f2] text-[#4d527f]" },
];

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  description: "GPS attendance for hybrid teams and visitor management for reception — check-ins only at approved offices and homes, visitors who check in from their own phone. From ₦250 per employee per month.",
};

function structuredData(PLANS: Awaited<ReturnType<typeof loadPublicPlans>>["plans"]) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: BRAND.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, Android, iOS",
    description: "Attendance and visitor management for Nigerian workplaces: GPS check-in only at an approved office or approved home on scheduled days, and visitors who check in from their own phone.",
    offers: Object.values(PLANS).map((plan) => ({
      "@type": "Offer", name: plan.name, price: plan.pricePerSeat, priceCurrency: "NGN", description: "Per employee per month",
    })),
  };
}

function Check() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-ok"><path d="m4.5 10.5 3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function SectionHead({ eyebrow, title, text, id }: { eyebrow: string; title: string; text?: string; id?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div className="max-w-2xl"><p className="eyebrow">{eyebrow}</p><h2 id={id} className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2></div>
      {text && <p className="max-w-md text-sm leading-6 text-muted">{text}</p>}
    </div>
  );
}

export default async function Home() {
  const { plans: PLANS, trialDays: TRIAL_DAYS } = await loadPublicPlans();
  return (
    <main className="overflow-hidden bg-[#faf9f6]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData(PLANS)) }} />

      <header className="sticky top-0 z-40 border-b border-transparent bg-[#faf9f6]/90 backdrop-blur supports-[backdrop-filter]:bg-[#faf9f6]/75">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <Logo />
          <nav aria-label="Main navigation" className="flex items-center gap-1 sm:gap-2">
            <a href="#attendance" className="hidden px-3 py-2 text-sm font-medium text-muted hover:text-ink md:inline-flex">Attendance</a>
            <a href="#visitors" className="hidden px-3 py-2 text-sm font-medium text-muted hover:text-ink md:inline-flex">Visitors</a>
            <a href="#security" className="hidden px-3 py-2 text-sm font-medium text-muted hover:text-ink lg:inline-flex">Security</a>
            <a href="#pricing" className="hidden px-3 py-2 text-sm font-medium text-muted hover:text-ink sm:inline-flex">Pricing</a>
            <a href="#faq" className="hidden px-3 py-2 text-sm font-medium text-muted hover:text-ink lg:inline-flex">FAQ</a>
            <Link href="/login" className="btn-ghost btn-sm">Sign in</Link>
            <Link href="/signup" className="btn-primary btn-sm hidden sm:inline-flex">Start free trial</Link>
          </nav>
        </div>
      </header>

      {/* ───────────── Hero */}
      <section className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-16 pt-8 sm:px-8 sm:pb-24 sm:pt-12 lg:grid-cols-[1.02fr_.98fr] lg:gap-14">
        <div className="relative z-10 max-w-2xl">
          <p className="eyebrow mb-5 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-brand" /> Attendance + visitor management for Nigerian workplaces</p>
          <h1 className="max-w-[14ch] text-[2.7rem] font-bold leading-[1.04] tracking-[-0.045em] sm:text-6xl lg:text-[4.1rem]">Know who’s in — staff and visitors.</h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-muted sm:text-lg sm:leading-8">{BRAND.name} checks your team in by GPS only at an approved office or approved home on scheduled days, and lets visitors check in from their own phone while reception stays in control. One calm workspace, priced per seat in naira.</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/signup" className="btn-brand px-5">Start a {TRIAL_DAYS}-day free trial <span aria-hidden>→</span></Link>
            <a href="#attendance" className="btn-ghost">See how it works</a>
          </div>
          <p className="mt-4 text-sm text-muted">No card to start. Trial includes visitor management. Plans from <strong className="font-semibold text-ink">{naira(PLANS.basic.pricePerSeat)} per seat per month.</strong></p>
          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-5 text-xs text-muted">
            <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-ok" /> No app to install</span>
            <span>Company email, Google or Microsoft sign-in</span><span>Paystack: card, transfer, USSD</span><span>NDPA-minded visitor records</span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[600px] lg:mr-0">
          <div aria-hidden="true" className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#edcfc2]/50 blur-3xl" />
          <div aria-hidden="true" className="absolute -bottom-14 -left-10 h-52 w-52 rounded-full bg-[#dce8e1]/80 blur-3xl" />
          <section aria-label="Illustrative 5ime attendance workspace" className="relative overflow-hidden rounded-[1.65rem] border border-[#deded7] bg-white shadow-[0_24px_70px_rgba(32,39,37,0.12)]">
            <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-6"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-dark text-sm font-black text-white">5</span><div><p className="text-sm font-bold">Today at Fieldnote</p><p className="text-[11px] text-muted">Thursday · Lagos</p></div></div><span className="chip bg-[#f9eee9] text-brand-dark">Illustrative demo</span></div>
            <div className="p-5 sm:p-6">
              <div className="grid grid-cols-3 gap-2.5 sm:gap-3"><div className="rounded-xl bg-[#f7f7f3] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Checked in</p><p className="mt-1 text-2xl font-bold tabular-nums">18<span className="text-sm font-medium text-muted">/22</span></p></div><div className="rounded-xl bg-[#f7f7f3] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted">At office</p><p className="mt-1 text-2xl font-bold tabular-nums">11</p></div><div className="rounded-xl bg-[#f7f7f3] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Visitors on site</p><p className="mt-1 text-2xl font-bold tabular-nums">3</p></div></div>
              <ul className="mt-4 divide-y divide-line">
                {team.map((person) => <li key={person.initials} className="flex items-center gap-3 py-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-bold ${person.tone}`}>{person.initials}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{person.name}</p><p className="truncate text-xs text-muted">{person.mode}</p></div><span className="shrink-0 text-xs tabular-nums text-muted">{person.time}</span></li>)}
              </ul>
              <div className="mt-2 rounded-xl border-2 border-amber-200 bg-[#fffaf0] px-3.5 py-3">
                <div className="flex items-center justify-between gap-3"><p className="text-xs font-bold text-[#7a4b06]">Waiting at reception</p><span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-[#7a4b06]">1</span></div>
                <div className="mt-2 flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">Amaka E. · MTN</p><p className="truncate text-[11px] text-muted">Walk-in · Meeting · from the QR poster</p></div><span className="shrink-0 rounded-lg bg-ok px-3 py-1.5 text-xs font-bold text-white">Admit</span></div>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-line bg-[#faf9f6] px-5 py-3 text-[10px] text-muted sm:px-6"><span>Sample names and activity</span><span>Not connected to live data</span></div>
          </section>
        </div>
      </section>

      {/* ───────────── Two modules */}
      <section aria-labelledby="modules" className="border-y border-line bg-white">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-16">
          <h2 id="modules" className="sr-only">Two modules, one workspace</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <a href="#attendance" className="group rounded-2xl border border-line bg-[#faf9f6] p-6 transition-colors hover:border-[#cdd5d0]">
              <p className="eyebrow">Module 1 · every plan</p><h3 className="mt-2 text-2xl font-bold">Attendance</h3>
              <p className="mt-2 text-sm leading-6 text-muted">GPS check-in at approved offices and homes, by schedule. Lateness, corrections, field days and reports — without chasing anyone.</p>
              <span className="mt-4 inline-flex text-sm font-semibold text-brand-dark">How attendance works <span aria-hidden className="ml-1 transition-transform group-hover:translate-x-0.5">→</span></span>
            </a>
            <a href="#visitors" className="group rounded-2xl border border-ink bg-[#faf9f6] p-6 transition-colors">
              <p className="eyebrow">Module 2 · Premium</p><h3 className="mt-2 text-2xl font-bold">Visitors</h3>
              <p className="mt-2 text-sm leading-6 text-muted">Invitations, a QR poster for walk-ins, a reception desk that admits each visitor, host alerts, and records that stand up to an NDPA question.</p>
              <span className="mt-4 inline-flex text-sm font-semibold text-brand-dark">How visitors work <span aria-hidden className="ml-1 transition-transform group-hover:translate-x-0.5">→</span></span>
            </a>
          </div>
        </div>
      </section>

      {/* ───────────── Attendance */}
      <section aria-labelledby="attendance" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-16 sm:px-8 sm:py-20">
        <SectionHead id="attendance" eyebrow="Attendance" title="A better attendance routine in three steps." text="Built around clear schedules, consistent rules and a respectful approach to people’s location data." />
        <div className="mt-9 grid gap-7 md:grid-cols-3 md:gap-10">{attendanceSteps.map((step) => <article key={step.n} className="border-t-2 border-brand pt-4"><p className="text-xs font-bold tracking-[0.12em] text-brand-dark">{step.n}</p><h3 className="mt-3 text-lg font-bold">{step.title}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-muted">{step.text}</p></article>)}</div>
        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{attendanceFeatures.map((f, i) => <article key={f.title} className="rounded-2xl border border-line bg-white p-5 transition-colors hover:border-[#cdd5d0]"><p className="text-[11px] font-bold tracking-[0.12em] text-brand-dark">{String(i + 1).padStart(2, "0")}</p><h3 className="mt-3 font-bold">{f.title}</h3><p className="mt-1.5 text-sm leading-6 text-muted">{f.text}</p></article>)}</div>
      </section>

      {/* ───────────── Visitors */}
      <section aria-labelledby="visitors" className="scroll-mt-20 border-y border-line bg-white">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <SectionHead id="visitors" eyebrow="Visitors · Premium" title="Visitors check in from their own phone. Reception stays in control." text="No sign-in book, no shared pen, no app to download. Nobody is let in until reception says so — unless you choose otherwise." />
          <div className="mt-10 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:gap-12">
            <div className="grid gap-4 sm:grid-cols-2">
              {visitorFlow.map((flow) => (
                <article key={flow.who} className="rounded-2xl border border-line bg-[#faf9f6] p-5">
                  <h3 className="font-bold">{flow.who}</h3>
                  <ol className="mt-4 space-y-3">{flow.steps.map((s, i) => <li key={s} className="flex gap-3 text-sm leading-6"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-bold text-white">{i + 1}</span><span>{s}</span></li>)}</ol>
                </article>
              ))}
              <article className="rounded-2xl border border-line bg-[#faf9f6] p-5 sm:col-span-2">
                <h3 className="font-bold">At the reception desk</h3>
                <p className="mt-2 text-sm leading-6 text-muted">Everyone who checked in appears in the waiting queue within seconds. Reception admits them (choosing the host for walk-ins), turns them away, or finds an invited visitor by typing their code or scanning the QR on their phone. Hosts are emailed. When the visitor leaves, they sign out from their phone.</p>
              </article>
            </div>
            <div aria-label="Illustrative visitor check-in on a phone" className="relative mx-auto w-full max-w-[300px]">
              <div aria-hidden="true" className="absolute -right-10 top-10 h-40 w-40 rounded-full bg-[#dce8e1]/80 blur-3xl" />
              <div className="relative rounded-[2.2rem] border-[10px] border-[#1b2127] bg-[#1b2127] shadow-[0_24px_70px_rgba(32,39,37,0.18)]">
                <div className="overflow-hidden rounded-[1.6rem] bg-paper">
                  <div className="bg-[#1b2127] px-4 pb-3 pt-4 text-white"><p className="text-sm font-bold">Fieldnote Ltd</p><p className="text-[10px] text-[#d6dbde]">Ikoyi Office · Visitor sign-in</p></div>
                  <div className="space-y-3 p-4 text-center">
                    <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-green-50 text-ok"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></div>
                    <p className="text-lg font-bold leading-tight">You’re in. Welcome, Amaka.</p>
                    <p className="text-xs text-muted">Bisi has been told you’re here.</p>
                    <div className="rounded-xl border border-line bg-white p-3 text-left"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted">Visitor · Fieldnote Ltd</p><p className="mt-0.5 font-bold">Amaka Eze</p><p className="text-[11px] text-muted">MTN · Meeting with Bisi A.</p><p className="text-[11px] text-muted">Signed in 10:44</p></div>
                    <p className="rounded-xl border border-line bg-white py-2.5 text-xs font-semibold">I’m leaving — sign me out</p>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-center text-[11px] text-muted">Illustrative · sample visitor</p>
            </div>
          </div>
          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{visitorFeatures.map((f) => <article key={f.title} className="rounded-2xl border border-line bg-[#faf9f6] p-5"><h3 className="font-bold">{f.title}</h3><p className="mt-1.5 text-sm leading-6 text-muted">{f.text}</p></article>)}</div>
        </div>
      </section>

      {/* ───────────── Roles */}
      <section aria-labelledby="roles" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
        <SectionHead id="roles" eyebrow="For everyone in the building" title="Each person sees what they need — and nothing more." />
        <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{roles.map((r) => <article key={r.role} className="rounded-2xl border border-line bg-white p-5"><h3 className="font-bold">{r.role}</h3><p className="mt-1.5 text-sm leading-6 text-muted">{r.text}</p></article>)}</div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-white p-5 sm:p-6">
          <div className="max-w-2xl"><h3 className="font-bold">Your company’s own sign-in page</h3><p className="mt-1 text-sm leading-6 text-muted">Staff sign in at your company link — <span className="font-mono text-ink">5imes.click/yourcompany</span> — with your logo and colours. Visitors see your company name on every screen.</p></div>
          <Link href="/signup" className="btn-ghost">Set up your company</Link>
        </div>
      </section>

      {/* ───────────── Security */}
      <section aria-labelledby="security" className="scroll-mt-20 bg-[#1b2127] text-white">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="max-w-2xl"><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#c9d0d3]">Security and privacy</p><h2 id="security" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Location and visitor data deserve care.</h2></div>
            <p className="max-w-md text-sm leading-6 text-[#c9d0d3]">Designed so the safe choice is the default — for your people, your visitors and your compliance team.</p>
          </div>
          <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{privacy.map((p) => <article key={p.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><h3 className="font-bold">{p.title}</h3><p className="mt-1.5 text-sm leading-6 text-[#c9d0d3]">{p.text}</p></article>)}</div>
          <ul className="mt-8 grid gap-2 text-sm text-[#dfe4e6] sm:grid-cols-2 lg:grid-cols-3">
            {["Encrypted connections (HTTPS) everywhere", "Every visitor action recorded in an audit trail", "Retention periods you choose; deletion is automatic", "Privacy notice visitors accept before checking in", "Rate limits on sign-ins, invitations and exports", "Export your data to CSV at any time"].map((t) => <li key={t} className="flex gap-2"><svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-[#8fd3b0]"><path d="m4.5 10.5 3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>{t}</li>)}
          </ul>
        </div>
      </section>

      {/* ───────────── Pricing */}
      <section aria-labelledby="pricing" className="scroll-mt-20 border-b border-line bg-white">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="max-w-2xl"><p className="eyebrow">Transparent per-seat pricing</p><h2 id="pricing" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Simple plans. Pay per term, in naira.</h2><p className="mt-3 text-sm leading-6 text-muted">Pick the term that fits your budget. Active and invited team members each use a seat; visitors are free. Add seats mid-term and pay only for the remaining time.</p></div>
          <p className="mt-4 text-sm text-muted">Every company starts with the {TRIAL_DAYS}-day free trial — visitor management included — then chooses Basic, Pro or Premium.</p>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">{Object.values(PLANS).map((plan) => <article key={plan.id} className={`flex flex-col rounded-2xl border bg-[#faf9f6] p-5 sm:p-6 ${plan.id === "premium" ? "border-ink" : "border-line"}`}>
            <div><p className="eyebrow">{plan.id === "basic" ? "For one location" : plan.id === "premium" ? "Attendance + visitors" : "For growing teams"}</p><h3 className="mt-1 text-2xl font-bold">{plan.name}</h3><p className="mt-1 min-h-10 text-sm text-muted">{plan.blurb}</p>
              <p className="mt-4 flex items-baseline gap-1.5"><span className="text-4xl font-extrabold tracking-tight tabular-nums">{naira(plan.pricePerSeat)}</span><span className="text-sm text-muted">per seat / month</span></p></div>
            <ul className="mt-5 grid flex-1 content-start gap-2">{plan.features.map((feature) => <li key={feature} className="flex gap-2 text-sm"><Check /><span>{feature}</span></li>)}</ul>
            <div className="mt-5 border-t border-line pt-4"><p className="eyebrow">Upfront price per seat</p><div className="mt-2 grid grid-cols-2 gap-2">{cycles.map((cycle) => <div key={cycle.label} className="rounded-xl border border-line bg-white px-3 py-2.5"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{cycle.label}</p><p className="mt-1 text-sm font-bold tabular-nums">{naira(plan.pricePerSeat * cycle.months)}</p></div>)}</div></div>
            <Link href="/signup" className={`${plan.id === "premium" ? "btn-brand" : "btn-primary"} mt-5 w-full`}>Start free trial · choose {plan.name} after</Link>
          </article>)}</div>
          <p className="mt-5 text-xs leading-5 text-muted">Totals are seats × per-seat monthly price × months — for example, 10 Basic seats are {naira(PLANS.basic.pricePerSeat * 10)} monthly or {naira(PLANS.basic.pricePerSeat * 30)} quarterly. Pay per term with Paystack (card, bank transfer or USSD). Nothing renews automatically unless you choose to; we remind you before your term ends.</p>
        </div>
      </section>

      {/* ───────────── FAQ */}
      <section aria-labelledby="faq" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-16 sm:px-8 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div><p className="eyebrow">Questions</p><h2 id="faq" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">What companies ask before they start.</h2></div>
          <div className="divide-y divide-line rounded-2xl border border-line bg-white">
            {faqs.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">{f.q}<span aria-hidden className="text-muted transition-transform group-open:rotate-45">+</span></summary>
                <p className="mt-2 text-sm leading-6 text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────── Final call */}
      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8 sm:pb-20">
        <div className="relative overflow-hidden rounded-[1.65rem] border border-[#eadfd7] bg-[#fcf6f1] px-6 py-10 sm:px-10 sm:py-12">
          <div aria-hidden="true" className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-[#edcfc2]/60 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div className="max-w-xl"><h2 className="text-3xl font-bold tracking-tight">Set up your company in about ten minutes.</h2><p className="mt-2 text-sm leading-6 text-muted">Add an office, invite your team, print the visitor poster. Free for {TRIAL_DAYS} days — no card needed.</p></div>
            <div className="flex flex-wrap gap-3"><Link href="/signup" className="btn-brand px-5">Start free trial <span aria-hidden>→</span></Link><Link href="/login" className="btn-ghost">Sign in</Link></div>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 text-sm sm:px-8 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
          <div><Logo /><p className="mt-3 max-w-xs text-xs leading-5 text-muted">{BRAND.tagline} Attendance and visitor management by Kora Forge.</p></div>
          <div><p className="eyebrow">Product</p><ul className="mt-3 space-y-2 text-muted"><li><a href="#attendance" className="hover:text-ink">Attendance</a></li><li><a href="#visitors" className="hover:text-ink">Visitors</a></li><li><a href="#pricing" className="hover:text-ink">Pricing</a></li></ul></div>
          <div><p className="eyebrow">Company</p><ul className="mt-3 space-y-2 text-muted"><li><a href="#security" className="hover:text-ink">Security</a></li><li><a href="#faq" className="hover:text-ink">FAQ</a></li></ul></div>
          <div><p className="eyebrow">Legal</p><ul className="mt-3 space-y-2 text-muted"><li><Link href="/privacy" className="hover:text-ink">Privacy</Link></li><li><Link href="/terms" className="hover:text-ink">Terms</Link></li><li><Link href="/login" className="font-semibold text-ink hover:text-brand-dark">Sign in to your workspace</Link></li></ul></div>
        </div>
        <p className="mx-auto max-w-7xl px-5 pb-8 text-xs text-muted sm:px-8">© {new Date().getFullYear()} {BRAND.name}. All rights reserved.</p>
      </footer>
    </main>
  );
}
