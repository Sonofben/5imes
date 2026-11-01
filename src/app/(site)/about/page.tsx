import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT } from "@/lib/constants";
import { Faq } from "@/components/site/Faq";

export const metadata: Metadata = {
  title: "About",
  description: "Why 5ime exists: a simple, fair way for any company to know who is at work, wherever they work, and who is visiting.",
  alternates: { canonical: "/about" },
};

const faq = [
  { q: "Who makes 5ime?", a: "5ime is built by Kora Forge Solutions, a software company in Lagos, Nigeria. 5ime runs as its own product with its own team and support." },
  { q: "How do I reach the team?", a: `Email ${CONTACT.info} for general questions, ${CONTACT.support} for help with your account, or ${CONTACT.sales} to talk about a larger roll out.` },
];

export default function AboutPage() {
  return (
    <>
      <article className="mx-auto max-w-3xl px-5 pb-14 pt-12 sm:px-8 sm:pt-16">
        <p className="eyebrow">About 5ime</p>
        <h1 className="mt-3 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">Why we built 5ime</h1>

        <div className="mt-8 space-y-10 text-[17px] leading-8 text-ink/85">
          <section>
            <h2 className="text-xl font-bold text-ink">The problem</h2>
            <p className="mt-3">Work stopped happening in one place. Teams now split their week between the office and home, sales and service staff spend their days at clients’ sites, and companies run more than one branch. But the tools for knowing who is at work were built for a single front door: a fingerprint machine on the wall, a sign in sheet, a visitor book at reception.</p>
            <p className="mt-3">Those tools cannot see someone working from home on an agreed day, or an engineer at a customer’s office. So managers chase people on the phone, staff feel watched or doubted, and the attendance report nobody trusts gets argued over at the end of the month.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-ink">The idea</h2>
            <p className="mt-3">Every staff member already carries a phone that knows where it is. If attendance checks the right place on the right day, at the moment someone starts and ends work, a company gets a record it can rely on without buying hardware and without tracking people all day.</p>
            <p className="mt-3">That is 5ime: check in at an approved office, at an approved home on home days, or at a client’s site, with visitors signing in on their own phone at reception. One honest picture of who is in.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-ink">What we care about</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li><b>Fairness.</b> The same clear rules for everyone, and a simple way to ask for an exception.</li>
              <li><b>Privacy.</b> Location is read only when someone checks in or out, and private details stay with the few people who need them.</li>
              <li><b>Simplicity.</b> A company should be set up in an afternoon, and staff should need no training.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-ink">Where we are going</h2>
            <p className="mt-3">5ime started with companies in Nigeria, where hybrid work, many branches and busy receptions are part of everyday life. The same problems exist in offices everywhere, and we are building 5ime to serve teams in any country.</p>
          </section>
        </div>

        <div className="mt-10 flex flex-wrap gap-3"><Link href="/signup" className="btn-brand px-5">Start free trial</Link><Link href="/contact" className="btn-ghost">Contact us</Link></div>
      </article>
      <Faq items={faq} title="About us" />
    </>
  );
}
