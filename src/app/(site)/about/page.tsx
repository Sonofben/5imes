import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT } from "@/lib/constants";
import { Faq } from "@/components/site/Faq";
import { CtaBand } from "@/components/site/CtaBand";

export const metadata: Metadata = {
  title: "About",
  description: "5ime is built in Lagos to give Nigerian companies a simple, fair way to know who is at work and who is visiting.",
  alternates: { canonical: "/about" },
};

const faq = [
  { q: "Who makes 5ime?", a: "5ime is built and run by a product team in Lagos, Nigeria. It is a product of Kora Forge." },
  { q: "How do I reach the team?", a: `Email ${CONTACT.hello} for anything, or ${CONTACT.sales} if you want to talk about a larger roll out.` },
];

export default function AboutPage() {
  return (
    <>
      <section className="mx-auto max-w-3xl px-5 pb-14 pt-12 sm:px-8 sm:pt-16">
        <p className="eyebrow">About 5ime</p>
        <h1 className="mt-3 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">Attendance that is fair to everyone.</h1>
        <div className="mt-6 space-y-4 text-lg leading-8 text-muted">
          <p>Most Nigerian offices still run attendance on a fingerprint machine by the door and visitors on a paper book at reception. Machines break, queues form in the morning and nobody can tell who is working from home, who is with a client and who is simply late.</p>
          <p>We built 5ime so a company can know who is in, wherever they work, using the phone every staff member already carries. It checks the right place on the right day, it is honest about what it records, and it is priced in naira for Nigerian businesses.</p>
          <p>5ime is made in Lagos by a small team that builds software for growing companies.</p>
        </div>
        <div className="mt-8 flex flex-wrap gap-3"><Link href="/signup" className="btn-brand px-5">Start free trial</Link><Link href="/contact" className="btn-ghost">Talk to sales</Link></div>
      </section>
      <Faq items={faq} title="About us" />
      <CtaBand />
    </>
  );
}
