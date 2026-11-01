import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT } from "@/lib/constants";
import { Faq } from "@/components/site/Faq";
import { CtaBand } from "@/components/site/CtaBand";

export const metadata: Metadata = {
  title: "Security and trust",
  description: "How 5ime protects your company’s data: an information security programme aligned with ISO/IEC 27001, data protection under the Nigeria Data Protection Act 2023 and the GDPR, and privacy first location handling.",
  alternates: { canonical: "/security" },
};

const pillars = [
  { title: "Access control", text: "Least privilege by role. Company admins choose who sees what, ordinary managers never see exact positions or home addresses, and two factor sign in is available for every admin and required for our own staff." },
  { title: "Separation between companies", text: "Every company’s data is kept separate from every other company’s, and this separation is tested automatically before every release." },
  { title: "Encryption", text: "Data is encrypted in transit between your devices and our service, and encrypted at rest." },
  { title: "Logging and audit trail", text: "Sensitive actions, such as approvals, exports and support access, are recorded so they can be reviewed later." },
  { title: "Secure development", text: "Changes are reviewed and pass automated security and privacy tests before they reach production." },
  { title: "Support access you control", text: "Our team cannot open your company’s data unless an admin grants time limited support access, and every use of it is logged." },
  { title: "Resilience", text: "Data is backed up and we keep a plan for restoring service and data if something goes wrong." },
  { title: "Incident response", text: "If a personal data breach affects you, we tell you without undue delay and notify the regulator within the time the law requires." },
  { title: "Suppliers", text: "We use a small number of carefully chosen service providers, each bound by data protection terms." },
];

const faq = [
  { q: "Is 5ime ISO 27001 certified?", a: "Not yet. Our information security programme follows the ISO/IEC 27001 framework and its Annex A controls, and certification is on our roadmap. We will say so here when it is achieved." },
  { q: "Does 5ime comply with the NDPA and the GDPR?", a: "5ime is built to help companies meet the Nigeria Data Protection Act 2023 and, for staff or visitors covered by it, the EU and UK GDPR. Your company is the controller of its staff and visitor data and 5ime processes it on your instructions." },
  { q: "Can we sign a data processing agreement?", a: `Yes. Email ${CONTACT.privacy} and we will send our data processing agreement.` },
  { q: "Where is our data stored?", a: `Data is held with established cloud providers under data protection terms. If your company needs details of locations and safeguards for transfers, email ${CONTACT.privacy}.` },
  { q: "Do you track staff location all day?", a: "No. Location is read when staff check in or out. Field visits store only the distance from the site and the reading’s accuracy, not a route." },
  { q: "What happens to our data if we leave?", a: "You can export your reports at any time. When a company closes its account, its data is deleted within 90 days, except records the law requires us to keep." },
  { q: "Can we send you a security questionnaire?", a: `Yes. Send it to ${CONTACT.security} and we will answer it. Some details are shared only under a confidentiality agreement.` },
  { q: "How do I report a security issue?", a: `Email ${CONTACT.security}. Please give us reasonable time to fix the issue before telling anyone else. We do not take action against good faith research.` },
];

export default function SecurityPage() {
  return (
    <>
      <section className="mx-auto max-w-7xl px-5 pb-10 pt-12 sm:px-8 sm:pt-16">
        <p className="eyebrow">Security and trust</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-[-0.04em] sm:text-5xl">Your people’s data, treated with care.</h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-muted">Attendance and visitor records are personal data. We run 5ime with an information security programme aligned with ISO/IEC 27001, and we design it around the Nigeria Data Protection Act 2023 and the GDPR.</p>
        <div className="mt-6 flex flex-wrap gap-2 text-sm">
          {["Aligned with ISO/IEC 27001", "Nigeria Data Protection Act 2023", "EU and UK GDPR"].map((b) => <span key={b} className="rounded-full border border-line bg-white px-3 py-1.5 font-semibold">{b}</span>)}
        </div>
      </section>

      <section className="border-y border-line bg-white">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
          <h2 className="text-3xl font-bold tracking-tight">How we protect your data</h2>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pillars.map((p) => <article key={p.title} className="rounded-2xl border border-line bg-[#faf9f6] p-5"><h3 className="font-bold">{p.title}</h3><p className="mt-1.5 text-sm leading-6 text-muted">{p.text}</p></article>)}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-5 py-14 sm:px-8 lg:grid-cols-3">
        <article className="rounded-2xl border border-line bg-white p-6">
          <h2 className="text-xl font-bold">Privacy by design</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Location is read only at check in and check out. Home addresses are visible only to the people who approve them. Visitor records are deleted on the schedule each company sets.</p>
        </article>
        <article className="rounded-2xl border border-line bg-white p-6">
          <h2 className="text-xl font-bold">Documents</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Read our <Link href="/privacy" className="font-semibold text-ink underline">privacy notice</Link> and <Link href="/terms" className="font-semibold text-ink underline">terms of service</Link>. Our data processing agreement and security answers are available on request.</p>
        </article>
        <article className="rounded-2xl border border-line bg-white p-6">
          <h2 className="text-xl font-bold">Contact</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Privacy and data requests: <a className="font-semibold text-ink underline" href={`mailto:${CONTACT.privacy}`}>{CONTACT.privacy}</a><br />Security reports: <a className="font-semibold text-ink underline" href={`mailto:${CONTACT.security}`}>{CONTACT.security}</a></p>
        </article>
      </section>

      <Faq items={faq} title="Security and privacy questions" />
      <CtaBand />
    </>
  );
}
