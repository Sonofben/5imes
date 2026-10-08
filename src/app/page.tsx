import Link from "next/link";
import { Logo } from "@/components/Logo";
import { BRAND, PLANS, TRIAL_DAYS, naira } from "@/lib/constants";

const steps = [
  { n: "01", t: "Set your office", d: "Drop a pin on your office. Pro companies add every branch with its own radius." },
  { n: "02", t: "Staff pin home once", d: "Each person pins their home from home. You approve it — it can’t be changed without you." },
  { n: "03", t: "Check in from the right place", d: "One tap on the phone. 5ime checks they’re at the office or home on the right day." },
];

const features = [
  ["Work email only", "Sign in with Microsoft, Google Workspace or a company email. No Gmail sign-ups."],
  ["Office + home geofences", "Check-ins only count inside the approved office or approved home."],
  ["Hybrid schedules", "Set office days and home days. Wrong place, wrong day gets flagged."],
  ["Late & early flags", "Set work hours and grace time. Lateness and early exits are tracked automatically."],
  ["Live dashboard", "See who’s in, where, right now — refreshed every minute."],
  ["Excel-ready reports", "Days present, office vs home, late days and hours. Download as CSV."],
];

export default function Home() {
  return (
    <main>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <a href="#pricing" className="btn-ghost btn-sm hidden sm:inline-flex">Pricing</a>
          <Link href="/login" className="btn-primary btn-sm">Sign in</Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-20 pt-12 sm:pt-20">
        <div className="max-w-3xl">
          <p className="chip mb-5 bg-brand/15 text-brand-dark">Attendance for hybrid teams</p>
          <h1 className="text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-7xl">
            Work from anywhere.
            <br />
            <span className="text-brand">5 days,</span> on time.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted">
            {BRAND.name} is the simple way to know your team is working — at the office on office days, at home on home
            days. GPS check-in from any phone, no app store needed.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login" className="btn-brand px-6 py-3 text-base">Start {TRIAL_DAYS}-day free trial</Link>
            <a href="#how" className="btn-ghost px-6 py-3 text-base">How it works</a>
          </div>
          <p className="mt-3 text-sm text-muted">From {naira(PLANS.basic.pricePerSeat)} per person per month. No card to start.</p>
        </div>
      </section>

      <section id="how" className="bg-ink py-20 text-white">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-3xl font-bold">Live in an afternoon</h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n}>
                <div className="text-sm font-bold text-brand">{s.n}</div>
                <h3 className="mt-2 text-xl font-bold">{s.t}</h3>
                <p className="mt-2 text-white/70">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-3xl font-bold">Everything a hybrid office needs. Nothing it doesn’t.</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(([t, d]) => (
            <div key={t} className="card">
              <h3 className="font-bold">{t}</h3>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="border-t border-line bg-white py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-3xl font-bold">Simple pricing, in naira</h2>
          <p className="mt-2 text-muted">Per person, per month. Same price whether you have 5 people or 500.</p>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {Object.values(PLANS).map((p) => (
              <div key={p.id} className={`card ${p.id === "pro" ? "border-ink ring-1 ring-ink" : ""}`}>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-2xl font-bold">{p.name}</h3>
                  {p.id === "pro" && <span className="chip bg-brand text-white">Most popular</span>}
                </div>
                <p className="text-sm text-muted">{p.blurb}</p>
                <div className="my-5">
                  <span className="text-4xl font-extrabold">{naira(p.pricePerSeat)}</span>
                  <span className="text-muted"> /person/month</span>
                </div>
                <ul className="space-y-2 text-sm">
                  {p.features.map((f) => <li key={f}>✓ {f}</li>)}
                </ul>
                <Link href="/login" className={`${p.id === "pro" ? "btn-brand" : "btn-primary"} mt-6 w-full`}>
                  Start free trial
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted">
            Every company starts with a {TRIAL_DAYS}-day free trial of Pro. Pay monthly by card, transfer or USSD.
          </p>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-10 text-sm text-muted">
        <Logo />
        <span>© {new Date().getFullYear()} {BRAND.name}. {BRAND.tagline}</span>
      </footer>
    </main>
  );
}
