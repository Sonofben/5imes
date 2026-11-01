import { JsonLd } from "./JsonLd";

export type FaqItem = { q: string; a: string };

/** Questions and answers at the bottom of a page, also published as FAQPage data. */
export function Faq({ items, title = "Questions people ask" }: { items: FaqItem[]; title?: string }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="faq" className="border-t border-line bg-white">
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div><p className="eyebrow">FAQ</p><h2 id="faq" className="mt-2 text-3xl font-bold tracking-tight">{title}</h2></div>
        <div className="divide-y divide-line border-y border-line">
          {items.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-semibold"><span>{f.q}</span><span aria-hidden className="text-muted transition group-open:rotate-45">+</span></summary>
              <p className="mt-2 text-sm leading-6 text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
