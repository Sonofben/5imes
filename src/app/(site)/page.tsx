import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/constants";
import { Money, CurrencySelect, CurrencyNote } from "@/components/site/Currency";
import { loadPublicPlans } from "@/lib/plans";
import { listPosts, CATEGORIES } from "@/lib/blog";
import { Faq } from "@/components/site/Faq";
import { CtaBand } from "@/components/site/CtaBand";
import { JsonLd } from "@/components/site/JsonLd";
import { publicOrigin } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  description: "5ime is staff attendance and visitor management for modern teams. Staff check in by GPS at the office, an approved home or a client site. Visitors sign in on their own phone. No hardware needed.",
};

const products = [
  { href: "/attendance", tag: "Attendance", title: "Check in only where work happens", text: "GPS check in at your offices or a staff member’s approved home, on the days they are scheduled. Late, early and absent are worked out for you." },
  { href: "/visitor-management", tag: "Visitor management", title: "Replace the visitor book", text: "Visitors sign in on their own phone, reception admits them and the host gets an email. One live list of everyone on site." },
  { href: "/field-staff", tag: "Field staff", title: "Proof of every client visit", text: "Sales reps and engineers check in at client sites with a note and a photo. Nothing is tracked between visits." },
];

const reasons = [
  { title: "Simple, fair pricing", text: "Pay per staff member, with prices shown in your own currency. No hardware, no set up fee and no long contract." },
  { title: "No machines to buy", text: "Staff use the phone they already have. No fingerprint devices to install, repair or queue at." },
  { title: "Fair to your staff", text: "Location is read only at check in and check out. Home addresses and exact positions stay hidden from ordinary managers." },
  { title: "Built for how teams work now", text: "Several branches, staff at home on agreed days, people out with clients and visitors at reception, all in one place." },
];

const steps = [
  { n: "01", title: "Create your workspace", text: "Sign up with your company email, add your offices and working hours." },
  { n: "02", title: "Invite your team", text: "Staff join from an email link and add 5ime to their phone home screen." },
  { n: "03", title: "Know who’s in", text: "Check ins appear live. Reports, leave and visitors are in the same place." },
];

// Plain facts, shown on the page and given to search engines, so AI answers about 5ime are accurate.
const FACTS = [
  { k: "What it is", v: "Staff attendance and visitor management software, with field visit check in, leave, tasks and celebrations included." },
  { k: "How staff check in", v: "GPS check in from their own phone, only inside an approved office area, an approved home on scheduled home days, or a client site." },
  { k: "Stopping false check ins", v: "Each check in records the GPS position and its accuracy. Check ins with weak GPS or outside the approved area are recorded and flagged for admin review. Device and network details are kept on Pro and Premium." },
  { k: "Visitors", v: "Visitors sign in on their own phone by QR code or invitation; reception admits them and the host is emailed." },
  { k: "Devices", v: "Works on Android, iPhone and computers in the browser, and installs on the home screen like an app. No hardware needed." },
  { k: "Reports and payroll", v: "Attendance, lateness and hours reports, exported as CSV for Excel or your payroll tool." },
  { k: "Security and privacy", v: "Two step sign in required for every admin; data encrypted in transit and at rest; designed for the GDPR and the Nigeria Data Protection Act 2023; security aligned with ISO/IEC 27001." },
  { k: "Price", v: "From ₦300 per staff member a month, with a free trial and no card needed." },
  { k: "Who makes it", v: "Kora Forge Solutions, a software company in Lagos, Nigeria." },
];

const faq = [
  { q: "Is 5ime the same as 5imes?", a: "Yes. The product is called 5ime (say “five time”) and its website is 5imes.click. People also search for it as 5imes or fivetime." },
  { q: "Is 5ime a safe, real company?", a: "5ime is built and run by Kora Forge Solutions in Lagos, Nigeria. It requires two step sign in for every admin, encrypts data in transit and at rest, and publishes its security practices, privacy notice and data processing agreement. See the Security and trust page." },
  { q: "Does 5ime have a mobile app?", a: "Staff use 5ime in their phone’s browser and add it to the home screen, where it opens like an app on Android and iPhone. There is nothing to download from an app store." },
  { q: "Does 5ime connect to payroll?", a: "5ime exports attendance, lateness and hours as CSV files that open in Excel and import into most payroll tools. Direct payroll integrations are not available yet." },
  { q: "What is 5ime?", a: "5ime is an attendance and visitor management service. Staff check in with their phone at an approved office, an approved home or a client site, and visitors sign in at reception on their own phone. Admins see who is in, who is late and who is visiting, live." },
  { q: "Do my staff need to install an app?", a: "No download from an app store is needed. 5ime runs in the phone’s browser and can be added to the home screen like an app, on Android and iPhone." },
  { q: "How much does 5ime cost?", a: "Plans start at ₦300 per staff member a month on Basic, ₦600 on Pro and ₦1,000 on Premium. The pricing page shows these in US dollars, euros and pounds too. Every company starts with a free Pro trial and no card is needed." },
  { q: "Can staff fake their location?", a: "No phone attendance app can fully prevent it. 5ime records the GPS position and how accurate it is at every check in, keeps device and network details on Pro and Premium, and flags anything unusual, such as weak GPS or a check in outside the approved area, for an admin to review." },
  { q: "Does 5ime follow data protection law?", a: "5ime is designed around the GDPR and the Nigeria Data Protection Act 2023: location is read only when staff check in or out, access follows roles, and companies decide how long records are kept. See our Security and trust page for details." },
];

export default async function Home() {
  const [{ plans, trialDays }, posts] = await Promise.all([loadPublicPlans(), listPosts({ limit: 3 })]);
  const origin = publicOrigin();
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "SoftwareApplication", "@id": `${origin}/#software`, name: BRAND.name, alternateName: BRAND.alternateNames,
        applicationCategory: "BusinessApplication", applicationSubCategory: "Time and attendance, visitor management", operatingSystem: "Web browser, Android, iOS (installable web app)",
        url: origin, publisher: { "@id": `${origin}/#organization` },
        description: "Staff attendance with GPS check in at approved offices, approved homes and client sites, plus visitor management where visitors sign in on their own phone.",
        featureList: FACTS.map((f) => `${f.k}: ${f.v}`),
        offers: Object.values(plans).map((p) => ({ "@type": "Offer", name: `${BRAND.name} ${p.name}`, price: p.pricePerSeat, priceCurrency: "NGN", description: "Per staff member per month", url: `${origin}/pricing` })) }} />

      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-16 pt-12 sm:px-8 sm:pt-20 lg:grid-cols-[1.05fr_.95fr]">
          <div className="max-w-2xl">
            <p className="eyebrow flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-brand" /> Attendance and visitor management</p>
            <h1 className="mt-4 text-[2.8rem] font-bold leading-[1.03] tracking-[-0.045em] sm:text-6xl">Know who’s in. Your team and your visitors.</h1>
            <p className="mt-6 text-lg leading-8 text-muted">{BRAND.name} shows you who is at work, who is working from home, who is out with a client and who is visiting your office. Staff check in with the phone they already have. No machines, no paper book.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="btn-brand px-5">Start free trial <span aria-hidden>→</span></Link>
              <Link href="/pricing" className="btn-ghost">See pricing</Link>
            </div>
            <p className="mt-4 text-sm text-muted">{trialDays} day free trial with every Pro feature. No card needed. From <b className="text-ink"><Money ngn={plans.basic.pricePerSeat} /></b> per staff a month.</p>
          </div>
          <div aria-label="Illustrative example of the 5ime dashboard" role="img" className="relative mx-auto w-full max-w-[560px]">
            <div aria-hidden className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-[#edcfc2]/60 blur-3xl" />
            <div className="relative rounded-[1.6rem] border border-[#deded7] bg-white p-5 shadow-[0_24px_70px_rgba(32,39,37,0.12)]">
              <div className="flex items-center justify-between"><p className="font-bold">Today at your company</p><span className="chip bg-[#f9eee9] text-brand-dark">Example</span></div>
              <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                {[["In office", "18", "text-ok"], ["At home", "4", "text-[#1E4E9C]"], ["Late", "2", "text-warn"], ["Visitors", "3", "text-brand-dark"]].map(([l, v, c]) => (
                  <div key={l} className="rounded-xl bg-paper p-3"><p className={`text-2xl font-extrabold ${c}`}>{v}</p><p className="mt-0.5 text-[11px] text-muted">{l}</p></div>
                ))}
              </div>
              <ul className="mt-4 divide-y divide-line text-sm">
                {[["Amaka O.", "Office · 8:47 am", "On time"], ["Chidi N.", "Client site · Lekki", "Field visit"], ["Ada E.", "Approved home", "On time"], ["Mr Bello", "Visitor for Tunde", "Admitted"]].map(([n, w, s]) => (
                  <li key={n} className="flex items-center justify-between py-2.5"><span><b>{n}</b><span className="block text-xs text-muted">{w}</span></span><span className="text-xs font-semibold text-muted">{s}</span></li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-white">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-16">
          <div className="max-w-2xl"><p className="eyebrow">What 5ime does</p><h2 className="mt-2 text-3xl font-bold tracking-tight">Three jobs, one place.</h2></div>
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {products.map((p) => (
              <Link key={p.href} href={p.href} className="group rounded-2xl border border-line bg-[#faf9f6] p-6 transition hover:border-ink">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-dark">{p.tag}</p>
                <h3 className="mt-3 text-xl font-bold">{p.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{p.text}</p>
                <p className="mt-4 text-sm font-semibold">Learn more <span aria-hidden className="inline-block transition group-hover:translate-x-1">→</span></p>
              </Link>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted">Also included: <Link href="/leave-tasks-celebrations" className="font-semibold text-ink underline">leave requests, tasks, birthdays and work anniversaries</Link>.</p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-16">
        <div className="max-w-2xl"><p className="eyebrow">Why teams choose 5ime</p><h2 className="mt-2 text-3xl font-bold tracking-tight">Made for real workplaces.</h2></div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {reasons.map((r) => <article key={r.title} className="rounded-2xl border border-line bg-white p-5"><h3 className="font-bold">{r.title}</h3><p className="mt-1.5 text-sm leading-6 text-muted">{r.text}</p></article>)}
        </div>
      </section>

      <section className="border-y border-line bg-white">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-16">
          <div className="max-w-2xl"><p className="eyebrow">Getting started</p><h2 className="mt-2 text-3xl font-bold tracking-tight">Live in an afternoon.</h2></div>
          <div className="mt-8 grid gap-7 md:grid-cols-3">{steps.map((s) => <article key={s.n} className="border-t-2 border-brand pt-4"><p className="text-xs font-bold tracking-[0.12em] text-brand-dark">{s.n}</p><h3 className="mt-2 text-lg font-bold">{s.title}</h3><p className="mt-1.5 text-sm leading-6 text-muted">{s.text}</p></article>)}</div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl"><p className="eyebrow">Pricing</p><h2 className="mt-2 text-3xl font-bold tracking-tight">Simple prices per staff member.</h2></div>
          <div className="flex flex-wrap items-center gap-3"><CurrencySelect /><Link href="/pricing" className="btn-ghost">Compare plans</Link></div>
        </div>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {Object.values(plans).map((p) => (
            <article key={p.id} className={`rounded-2xl border bg-white p-5 ${p.id === "pro" ? "border-ink" : "border-line"}`}>
              <h3 className="font-bold">{p.name}</h3><p className="mt-1 text-sm text-muted">{p.blurb}</p>
              <p className="mt-3"><span className="text-3xl font-extrabold"><Money ngn={p.pricePerSeat} /></span><span className="text-sm text-muted"> per staff a month</span></p>
            </article>
          ))}
        </div>
        <div className="mt-3"><CurrencyNote /></div>
      </section>

      {posts.length > 0 && (
        <section className="border-t border-line bg-white">
          <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-16">
            <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">From the blog</p><h2 className="mt-2 text-3xl font-bold tracking-tight">Guides and comparisons</h2></div><Link href="/blog" className="btn-ghost">All posts</Link></div>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {posts.map((p) => (
                <Link key={p.slug} href={`/blog/${p.slug}`} className="rounded-2xl border border-line bg-[#faf9f6] p-5 hover:border-ink">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-dark">{CATEGORIES[p.category]}</p>
                  <h3 className="mt-2 font-bold leading-6">{p.title}</h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">{p.excerpt}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
        <div className="max-w-2xl"><p className="eyebrow">5ime at a glance</p><h2 className="mt-2 text-3xl font-bold tracking-tight">The short facts</h2></div>
        <dl className="mt-6 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {FACTS.map((f) => <div key={f.k} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[220px_minmax(0,1fr)]"><dt className="font-semibold">{f.k}</dt><dd className="text-sm leading-6 text-muted">{f.v}</dd></div>)}
        </dl>
        <p className="mt-3 text-sm text-muted">More detail: <Link href="/security" className="font-semibold text-ink underline">Security and trust</Link> · <Link href="/pricing" className="font-semibold text-ink underline">Pricing</Link> · <Link href="/about" className="font-semibold text-ink underline">About</Link></p>
      </section>

      <Faq items={faq} />
      <CtaBand />
    </>
  );
}
