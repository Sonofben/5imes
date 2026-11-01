import type { Metadata } from "next";
import Link from "next/link";
import { FIELD_ADDON_PRICE } from "@/lib/constants";
import { Money, CurrencySelect, CurrencyNote } from "@/components/site/Currency";
import { loadPublicPlans } from "@/lib/plans";
import { Faq } from "@/components/site/Faq";
import { CtaBand } from "@/components/site/CtaBand";
import { PriceCalculator } from "./PriceCalculator";

export const metadata: Metadata = {
  title: "Pricing",
  description: "5ime pricing per staff member a month: Basic ₦300, Pro ₦600 and Premium ₦1,000, also shown in US dollars, euros and pounds. Free trial with every Pro feature, no card needed.",
  alternates: { canonical: "/pricing" },
};

export default async function PricingPage() {
  const { plans, trialDays } = await loadPublicPlans();
  const list = Object.values(plans);
  const faq = [
    { q: "Is there a free trial?", a: `Yes. Every company starts with a ${trialDays} day trial with every Pro feature, including visitor management. No card is needed.` },
    { q: "Which currency am I billed in?", a: "Plans are billed in Nigerian naira today. Prices in US dollars, euros and pounds on this page are a guide, and your bank converts the naira amount when you pay by card." },
    { q: "How do I pay?", a: "Pay by card, bank transfer or USSD through Paystack, or with Moniepoint. Pay monthly, every 3 months, every 6 months or yearly. The monthly price is the same on every term." },
    { q: "Does it renew automatically?", a: "Only if you choose automatic renewal at checkout. Otherwise you pay each term yourself and we remind you before it ends." },
    { q: "Who counts as a seat?", a: "Every active or invited staff member. Visitors are free and never use a seat." },
    { q: "Can I add staff during a term?", a: "Yes. Add seats from Billing at any time. Each added seat is charged at the plan price for the months of your current term, and your end date stays the same." },
    { q: "Can I get a receipt or an invoice?", a: "Every payment has a receipt in Billing. If your finance team needs a pro forma invoice before paying, talk to sales." },
  ];
  return (
    <>
      <section className="mx-auto max-w-7xl px-5 pb-10 pt-12 sm:px-8 sm:pt-16">
        <p className="eyebrow">Pricing</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-[-0.04em] sm:text-5xl">Pay per staff member. Nothing else.</h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-muted">Start with a free {trialDays} day trial of everything in Pro. Then pick the plan that fits. No hardware, no set up fee, no long contract.</p>
        <div className="mt-5"><CurrencySelect /></div>
      </section>
      <section className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid gap-4 lg:grid-cols-3">
          {list.map((p) => (
            <article key={p.id} className={`flex flex-col rounded-[1.4rem] border bg-white p-6 ${p.id === "pro" ? "border-ink shadow-lg" : "border-line"}`}>
              <div className="flex items-center justify-between"><h2 className="text-xl font-bold">{p.name}</h2>{p.id === "pro" && <span className="chip bg-brand/10 text-brand-dark">Most popular</span>}</div>
              <p className="mt-1 text-sm text-muted">{p.blurb}</p>
              <p className="mt-4"><span className="text-4xl font-extrabold"><Money ngn={p.pricePerSeat} /></span><span className="text-sm text-muted"> per staff a month</span></p>
              <ul className="mt-5 flex-1 space-y-2 text-sm">{p.features.map((f) => <li key={f} className="flex gap-2"><span aria-hidden className="font-bold text-ok">✓</span><span>{f}</span></li>)}</ul>
              <Link href="/signup" className={`${p.id === "pro" ? "btn-brand" : "btn-primary"} mt-6 w-full`}>Start free trial</Link>
            </article>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted">Field staff on Pro: <Money ngn={FIELD_ADDON_PRICE} /> per field person a month, added at checkout or later. Included in Premium.</p>
        <div className="mt-2"><CurrencyNote /></div>
      </section>
      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
        <h2 className="text-2xl font-bold tracking-tight">Work out your price</h2>
        <div className="mt-5"><PriceCalculator plans={list.map((p) => ({ id: p.id, name: p.name, pricePerSeat: p.pricePerSeat, maxSeats: p.maxSeats }))} /></div>
        <p className="mt-4 text-sm text-muted">More than 500 staff or need an invoice and purchase order? <Link href="/contact" className="font-semibold text-ink underline">Talk to sales</Link>.</p>
      </section>
      <Faq items={faq} title="Pricing questions" />
      <CtaBand />
    </>
  );
}
