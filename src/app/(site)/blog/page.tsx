import type { Metadata } from "next";
import Link from "next/link";
import { listPosts, CATEGORIES, fmtPostDate, type Category } from "@/lib/blog";
import { CtaBand } from "@/components/site/CtaBand";

export const metadata: Metadata = {
  title: "Blog: attendance guides and comparisons",
  description: "Guides on staff attendance, hybrid work and visitor management, and honest comparisons of 5ime with Jibble, Connecteam, fingerprint machines and the paper visitor book.",
  alternates: { canonical: "/blog" },
};

export default async function BlogIndex({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const sp = await searchParams;
  const category = (Object.hasOwn(CATEGORIES, sp.category ?? "") ? sp.category : undefined) as Category | undefined;
  const posts = await listPosts({ category });
  const [lead, ...rest] = posts;
  return (
    <>
      <section className="mx-auto max-w-7xl px-5 pb-8 pt-12 sm:px-8 sm:pt-16">
        <p className="eyebrow">Blog</p>
        <h1 className="mt-3 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">Guides and comparisons</h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-muted">Practical writing on attendance, hybrid work and visitors at work, and honest comparisons to help you choose.</p>
        <nav aria-label="Categories" className="mt-6 flex flex-wrap gap-2 text-sm">
          <Link href="/blog" aria-current={!category ? "page" : undefined} className={`rounded-full border px-3 py-1.5 font-semibold ${!category ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>All</Link>
          {(Object.keys(CATEGORIES) as Category[]).map((c) => (
            <Link key={c} href={`/blog?category=${c}`} aria-current={category === c ? "page" : undefined} className={`rounded-full border px-3 py-1.5 font-semibold ${category === c ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>{CATEGORIES[c]}</Link>
          ))}
        </nav>
      </section>
      <section className="mx-auto max-w-7xl px-5 pb-6 sm:px-8">
        {!lead ? <p className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-muted">No posts here yet.</p> : <>
          <Link href={`/blog/${lead.slug}`} className="grid gap-6 rounded-[1.6rem] border border-line bg-white p-6 hover:border-ink sm:p-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-dark">{CATEGORIES[lead.category]} · {fmtPostDate(lead.published_at)}</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight">{lead.title}</h2>
              <p className="mt-3 leading-7 text-muted">{lead.excerpt}</p>
              <p className="mt-4 text-sm font-semibold">Read the post →</p>
            </div>
            {lead.cover_url ? <img src={lead.cover_url} alt="" className="aspect-[16/10] w-full rounded-2xl object-cover" /> : <div aria-hidden className="grid aspect-[16/10] place-items-center rounded-2xl bg-[#f4e5dc] text-6xl font-extrabold text-brand-dark">5</div>}
          </Link>
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rest.map((p) => (
              <Link key={p.slug} href={`/blog/${p.slug}`} className="flex flex-col rounded-2xl border border-line bg-white p-5 hover:border-ink">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-dark">{CATEGORIES[p.category]}</p>
                <h2 className="mt-2 text-lg font-bold leading-6">{p.title}</h2>
                <p className="mt-2 line-clamp-3 flex-1 text-sm leading-6 text-muted">{p.excerpt}</p>
                <p className="mt-4 text-xs text-muted">{fmtPostDate(p.published_at)}</p>
              </Link>
            ))}
          </div>
        </>}
      </section>
      <CtaBand />
    </>
  );
}
