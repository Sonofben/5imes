import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPost, listPosts, CATEGORIES, fmtPostDate } from "@/lib/blog";
import { parseMarkdown, headings, readingMinutes } from "@/lib/markdownParse";
import { Markdown } from "@/components/Markdown";
import { Faq } from "@/components/site/Faq";
import { CtaBand } from "@/components/site/CtaBand";
import { JsonLd } from "@/components/site/JsonLd";
import { publicOrigin } from "@/lib/site";
import { BRAND } from "@/lib/constants";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = await getPost((await params).slug);
  if (!post) return { title: "Not found" };
  const title = post.seo_title || post.title;
  const description = post.seo_description || post.excerpt;
  return {
    title: { absolute: `${title} · ${BRAND.name}` }, description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: { type: "article", title, description, publishedTime: post.published_at, modifiedTime: post.updated_at, ...(post.cover_url ? { images: [{ url: post.cover_url }] } : {}) },
  };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const post = await getPost((await params).slug);
  if (!post) notFound();
  const toc = headings(parseMarkdown(post.body)).filter((h) => h.level === 2);
  const related = (await listPosts({ limit: 6 })).filter((p) => p.slug !== post.slug).slice(0, 3);
  const origin = publicOrigin();
  return (
    <>
      <JsonLd data={[
        { "@context": "https://schema.org", "@type": "BlogPosting", headline: post.title, description: post.excerpt, datePublished: post.published_at, dateModified: post.updated_at,
          author: { "@type": "Organization", name: post.author_name }, publisher: { "@type": "Organization", name: BRAND.name, logo: { "@type": "ImageObject", url: `${origin}/icon-512.png` } },
          mainEntityOfPage: `${origin}/blog/${post.slug}`, ...(post.cover_url ? { image: post.cover_url } : {}), keywords: post.tags.join(", ") },
        { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
          { "@type": "ListItem", position: 2, name: "Blog", item: `${origin}/blog` },
          { "@type": "ListItem", position: 3, name: post.title, item: `${origin}/blog/${post.slug}` } ] },
      ]} />
      <article className="mx-auto max-w-7xl px-5 pb-10 pt-10 sm:px-8 sm:pt-14">
        <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/blog" className="hover:text-ink">Blog</Link> / <Link href={`/blog?category=${post.category}`} className="hover:text-ink">{CATEGORIES[post.category]}</Link></nav>
        <header className="mt-4 max-w-3xl">
          <h1 className="text-4xl font-bold leading-[1.1] tracking-[-0.035em] sm:text-5xl">{post.title}</h1>
          <p className="mt-4 text-lg leading-8 text-muted">{post.excerpt}</p>
          <p className="mt-4 text-sm text-muted">{post.author_name} · {fmtPostDate(post.published_at)}{post.updated_at > post.published_at ? ` · Updated ${fmtPostDate(post.updated_at)}` : ""} · {readingMinutes(post.body)} min read</p>
        </header>
        {post.cover_url && <img src={post.cover_url} alt="" className="mt-8 aspect-[2/1] w-full max-w-4xl rounded-[1.6rem] object-cover" />}
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-w-0 max-w-3xl"><Markdown source={post.body} /></div>
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            {toc.length > 2 && <nav aria-label="On this page" className="rounded-2xl border border-line bg-white p-4 text-sm"><p className="font-semibold">On this page</p><ul className="mt-2 space-y-1.5">{toc.map((h) => <li key={h.id}><a href={`#${h.id}`} className="text-muted hover:text-ink">{h.text}</a></li>)}</ul></nav>}
            <div className="rounded-2xl bg-ink p-5 text-white"><p className="font-bold">Try 5ime free</p><p className="mt-1 text-sm text-white/75">Every Pro feature, no card needed.</p><Link href="/signup" className="btn-brand btn-sm mt-3">Start free trial</Link></div>
          </aside>
        </div>
      </article>
      {post.faq.length > 0 && <Faq items={post.faq} />}
      {related.length > 0 && (
        <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
          <h2 className="text-2xl font-bold tracking-tight">Keep reading</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">{related.map((p) => <Link key={p.slug} href={`/blog/${p.slug}`} className="rounded-2xl border border-line bg-white p-5 hover:border-ink"><p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-dark">{CATEGORIES[p.category]}</p><h3 className="mt-2 font-bold leading-6">{p.title}</h3></Link>)}</div>
        </section>
      )}
      <CtaBand />
    </>
  );
}
