import { CONTACT } from "@/lib/constants";

export type LegalSection = { heading: string; body: React.ReactNode };

export function LegalPage({ title, updated, intro, sections }: { title: string; updated: string; intro: React.ReactNode; sections: LegalSection[] }) {
  return (
    <article className="mx-auto max-w-3xl space-y-6 px-5 pb-16 pt-12 sm:px-8">
      <div>
        <p className="eyebrow">Last updated {updated}</p>
        <h1 className="page-heading mt-1">{title}</h1>
      </div>
      <div className="space-y-3 text-[15px] leading-7 text-ink/85">{intro}</div>
      <nav aria-label="Contents" className="rounded-2xl border border-line bg-white p-4 text-sm">
        <p className="font-semibold">Contents</p>
        <ol className="mt-2 grid list-decimal gap-1 pl-5 sm:grid-cols-2">{sections.map((s, i) => <li key={s.heading}><a href={`#s${i + 1}`} className="text-muted hover:text-ink">{s.heading}</a></li>)}</ol>
      </nav>
      {sections.map((s, i) => (
        <section key={s.heading} id={`s${i + 1}`} className="scroll-mt-24 space-y-2">
          <h2 className="text-lg font-bold">{i + 1}. {s.heading}</h2>
          <div className="space-y-2 text-[15px] leading-7 text-ink/85 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">{s.body}</div>
        </section>
      ))}
      <p className="border-t border-line pt-6 text-sm text-muted">
        Questions about this document? Email <a className="font-semibold text-ink underline" href={`mailto:${CONTACT.privacy}`}>{CONTACT.privacy}</a>.
      </p>
    </article>
  );
}
