import Link from "next/link";

/** The opening of a product or company page. */
export function PageHero({ eyebrow, title, text, children, secondary }: {
  eyebrow: string; title: string; text: string; children?: React.ReactNode; secondary?: { href: string; label: string };
}) {
  return (
    <section className="mx-auto grid max-w-7xl gap-10 px-5 pb-14 pt-12 sm:px-8 sm:pt-16 lg:grid-cols-[1fr_1fr] lg:items-center">
      <div className="max-w-2xl">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-3 text-4xl font-bold leading-[1.06] tracking-[-0.04em] sm:text-5xl">{title}</h1>
        <p className="mt-5 text-lg leading-8 text-muted">{text}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/signup" className="btn-brand px-5">Start free trial</Link>
          {secondary && <Link href={secondary.href} className="btn-ghost">{secondary.label}</Link>}
        </div>
      </div>
      {children && <div>{children}</div>}
    </section>
  );
}

export function FeatureGrid({ items, cols = 3 }: { items: { title: string; text: string }[]; cols?: 2 | 3 | 4 }) {
  const c = cols === 4 ? "lg:grid-cols-4" : cols === 2 ? "lg:grid-cols-2" : "lg:grid-cols-3";
  return (
    <div className={`grid gap-3 sm:grid-cols-2 ${c}`}>
      {items.map((f) => <article key={f.title} className="rounded-2xl border border-line bg-white p-5"><h3 className="font-bold">{f.title}</h3><p className="mt-1.5 text-sm leading-6 text-muted">{f.text}</p></article>)}
    </div>
  );
}

export function Section({ eyebrow, title, text, children, tone = "plain", id }: {
  eyebrow?: string; title: string; text?: string; children?: React.ReactNode; tone?: "plain" | "white"; id?: string;
}) {
  return (
    <section id={id} className={tone === "white" ? "border-y border-line bg-white" : ""}>
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-16">
        <div className="max-w-2xl">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2 className="mt-2 text-3xl font-bold tracking-tight">{title}</h2>{text && <p className="mt-3 leading-7 text-muted">{text}</p>}</div>
        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  );
}
