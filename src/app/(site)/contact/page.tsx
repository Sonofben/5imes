import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT } from "@/lib/constants";
import { readFlash } from "@/lib/flash";
import { Flash } from "@/components/Flash";
import { Faq } from "@/components/site/Faq";
import { sendEnquiry } from "./actions";

export const metadata: Metadata = {
  title: "Contact us",
  description: "Contact the 5ime team: sales for larger roll outs and invoices, support for help with your account, and general questions.",
  alternates: { canonical: "/contact" },
};

const faq = [
  { q: "Do I need to talk to sales to start?", a: "No. Anyone can start a free trial and set up their company in minutes. Talk to us if you have many branches, need an invoice or have procurement or data protection questions." },
  { q: "How quickly will you reply?", a: "Within one working day, Monday to Friday." },
];

export default async function ContactPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const flash = readFlash(await searchParams);
  return (
    <>
      <section className="mx-auto grid max-w-7xl gap-10 px-5 pb-14 pt-12 sm:px-8 sm:pt-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div>
          <p className="eyebrow">Contact us</p>
          <h1 className="mt-3 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">Talk to the 5ime team</h1>
          <p className="mt-4 text-lg leading-8 text-muted">Planning a roll out across branches, need an invoice, or have data protection questions? Send us a message and a person will reply.</p>
          <ul className="mt-6 space-y-3 text-sm">
            <li><b>Sales:</b> <a className="underline" href={`mailto:${CONTACT.sales}`}>{CONTACT.sales}</a></li>
            <li><b>Support for customers:</b> <a className="underline" href={`mailto:${CONTACT.support}`}>{CONTACT.support}</a></li>
            <li><b>Privacy and data requests:</b> <a className="underline" href={`mailto:${CONTACT.privacy}`}>{CONTACT.privacy}</a></li>
            <li><b>Anything else:</b> <a className="underline" href={`mailto:${CONTACT.info}`}>{CONTACT.info}</a></li>
          </ul>
          <p className="mt-6 text-sm text-muted">Just want to try it? <Link href="/signup" className="font-semibold text-ink underline">Start a free trial</Link>, no call needed.</p>
        </div>
        <form id="form" action={sendEnquiry} className="card space-y-4">
          <Flash {...flash} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label" htmlFor="c-name">Your name</label><input id="c-name" name="name" required minLength={2} maxLength={100} autoComplete="name" className="input" /></div>
            <div><label className="label" htmlFor="c-email">Work email</label><input id="c-email" name="email" type="email" required maxLength={200} autoComplete="email" className="input" /></div>
            <div><label className="label" htmlFor="c-company">Company</label><input id="c-company" name="company" maxLength={120} autoComplete="organization" className="input" /></div>
            <div><label className="label" htmlFor="c-phone">Phone (optional)</label><input id="c-phone" name="phone" maxLength={40} autoComplete="tel" className="input" /></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="c-staff">Number of staff</label><input id="c-staff" name="staff" inputMode="numeric" pattern="[0-9]*" maxLength={7} className="input" /></div>
          </div>
          <div><label className="label" htmlFor="c-msg">How can we help?</label><textarea id="c-msg" name="message" required minLength={10} maxLength={4000} rows={5} className="input" /></div>
          <div aria-hidden className="hidden"><label htmlFor="c-web">Website</label><input id="c-web" name="website" tabIndex={-1} autoComplete="off" /></div>
          <p className="text-xs leading-5 text-muted">We use these details only to reply to you and keep them for up to two years. See our <Link href="/privacy" className="underline">privacy notice</Link>.</p>
          <button className="btn-brand w-full sm:w-auto">Send message</button>
        </form>
      </section>
      <Faq items={faq} title="Talking to us" />
    </>
  );
}
