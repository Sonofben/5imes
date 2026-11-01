"use client";

import { useState } from "react";
import { Markdown } from "@/components/Markdown";

export type EditorPost = {
  title: string; slug: string; excerpt: string; body: string; category: string; tags: string; author_name: string;
  seo_title: string; seo_description: string; faq: { q: string; a: string }[]; cover_url: string | null; status: string; published_at: string | null;
};

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

const HELP = `## A heading
### A smaller heading
**bold**, *italic*, [a link](/pricing)
- a list item
1. a numbered item
> a highlighted note
| Feature | 5ime | Other |
|---|---|---|
| Visitors | Yes | No |`;

export function PostEditor({ post, isNew, canPublish, action }: { post: EditorPost; isNew: boolean; canPublish: boolean; action: (f: FormData) => void }) {
  const [title, setTitle] = useState(post.title);
  const [slug, setSlug] = useState(post.slug);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [body, setBody] = useState(post.body);
  const [faq, setFaq] = useState(post.faq);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [seoTitle, setSeoTitle] = useState(post.seo_title);
  const [seoDesc, setSeoDesc] = useState(post.seo_description);
  const [excerpt, setExcerpt] = useState(post.excerpt);
  const words = body.split(/\s+/).filter(Boolean).length;
  return (
    <form action={action} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <input type="hidden" name="faq" value={JSON.stringify(faq.filter((f) => f.q.trim() || f.a.trim()))} />
      <div className="space-y-4">
        <div className="card space-y-3">
          <div><label className="label" htmlFor="p-title">Title</label><input id="p-title" name="title" required maxLength={140} value={title} onChange={(e) => { setTitle(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} className="input text-lg font-semibold" /></div>
          <div><label className="label" htmlFor="p-slug">Link</label><div className="flex items-center gap-1 text-sm"><span className="text-muted">/blog/</span><input id="p-slug" name="slug" required value={slug} onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }} className="input font-mono text-sm" /></div>
            {!isNew && <p className="mt-1 text-xs text-warn">Changing the link of a published post breaks links people have shared.</p>}</div>
          <div><label className="label" htmlFor="p-excerpt">Summary <span className="font-normal text-muted">({excerpt.length}/320)</span></label><textarea id="p-excerpt" name="excerpt" maxLength={320} rows={2} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} className="input" /><p className="mt-1 text-xs text-muted">Shown on the blog page and under the title. One or two sentences that answer the question in the title.</p></div>
        </div>
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex gap-1 rounded-lg bg-paper p-1 text-sm">{(["write", "preview"] as const).map((t) => <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-md px-3 py-1 font-semibold ${tab === t ? "bg-white shadow" : "text-muted"}`}>{t === "write" ? "Write" : "Preview"}</button>)}</div>
            <span className="text-xs text-muted">{words} words · about {Math.max(1, Math.round(words / 220))} min read</span>
          </div>
          <textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={28} className={`input font-mono text-sm leading-6 ${tab === "write" ? "" : "hidden"}`} aria-label="Post body" />
          {tab === "preview" && <div className="min-h-[300px] rounded-xl border border-line bg-[#faf9f6] p-5"><Markdown source={body} /></div>}
          <details className="text-xs text-muted"><summary className="cursor-pointer font-semibold">How to format</summary><pre className="mt-2 whitespace-pre-wrap rounded-lg bg-paper p-3">{HELP}</pre></details>
        </div>
        <div className="card space-y-3">
          <div><p className="font-bold">Questions and answers</p><p className="text-xs text-muted">Shown at the bottom of the post and given to search engines and AI assistants. Write each answer so it makes sense on its own.</p></div>
          {faq.map((f, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-line p-3">
              <input aria-label={`Question ${i + 1}`} placeholder="Question" value={f.q} maxLength={300} onChange={(e) => setFaq(faq.map((x, j) => j === i ? { ...x, q: e.target.value } : x))} className="input" />
              <textarea aria-label={`Answer ${i + 1}`} placeholder="Answer" value={f.a} maxLength={2000} rows={2} onChange={(e) => setFaq(faq.map((x, j) => j === i ? { ...x, a: e.target.value } : x))} className="input" />
              <button type="button" onClick={() => setFaq(faq.filter((_, j) => j !== i))} className="justify-self-start text-xs font-semibold text-bad">Remove</button>
            </div>
          ))}
          {faq.length < 20 && <button type="button" onClick={() => setFaq([...faq, { q: "", a: "" }])} className="btn-ghost btn-sm">Add a question</button>}
        </div>
      </div>
      <aside className="space-y-4">
        <div className="card space-y-3">
          <p className="text-sm">Status: <b>{post.status === "published" ? "Published" : "Draft"}</b></p>
          {canPublish ? <>
            <div><label className="label" htmlFor="p-date">Publish date (optional)</label><input id="p-date" name="publish_at" type="date" defaultValue={post.published_at ? post.published_at.slice(0, 10) : ""} className="input" /><p className="mt-1 text-xs text-muted">A future date schedules the post.</p></div>
            <div className="grid gap-2">
              <button name="intent" value="publish" className="btn-brand w-full">{post.status === "published" ? "Update published post" : "Publish"}</button>
              <button name="intent" value="draft" className="btn-ghost w-full">{post.status === "published" ? "Unpublish and save as draft" : "Save draft"}</button>
            </div>
          </> : <p className="text-xs text-muted">Your role can read posts but not change them.</p>}
        </div>
        <div className="card space-y-3">
          <div><label className="label" htmlFor="p-cat">Category</label><select id="p-cat" name="category" defaultValue={post.category} className="input"><option value="comparison">Comparison</option><option value="guide">Guide</option><option value="product">Product</option><option value="news">News</option></select></div>
          <div><label className="label" htmlFor="p-tags">Tags</label><input id="p-tags" name="tags" defaultValue={post.tags} placeholder="attendance, jibble" className="input" /><p className="mt-1 text-xs text-muted">Separate with commas.</p></div>
          <div><label className="label" htmlFor="p-author">Author</label><input id="p-author" name="author_name" defaultValue={post.author_name} maxLength={80} className="input" /></div>
        </div>
        <div className="card space-y-3">
          <p className="font-bold">Cover image</p>
          {post.cover_url && <><img src={post.cover_url} alt="" className="aspect-[2/1] w-full rounded-lg object-cover" /><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="remove_cover" /> Remove</label></>}
          <input name="cover" type="file" accept="image/png,image/jpeg,image/webp" className="input py-2 text-sm" aria-label="Cover image" />
          <p className="text-xs text-muted">PNG, JPG or WebP, up to 2 MB. Wide images (2:1) look best.</p>
        </div>
        <div className="card space-y-3">
          <p className="font-bold">Search and AI</p>
          <div><label className="label" htmlFor="p-st">Search title <span className="font-normal text-muted">({seoTitle.length}/70)</span></label><input id="p-st" name="seo_title" maxLength={70} value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} placeholder={title} className="input" /></div>
          <div><label className="label" htmlFor="p-sd">Search description <span className="font-normal text-muted">({seoDesc.length}/170)</span></label><textarea id="p-sd" name="seo_description" maxLength={170} rows={3} value={seoDesc} onChange={(e) => setSeoDesc(e.target.value)} placeholder={excerpt} className="input" /></div>
          <div className="rounded-lg border border-line bg-white p-3 text-xs"><p className="truncate text-[#1a0dab]">{seoTitle || title || "Post title"}</p><p className="text-[#006621]">5imes.click/blog/{slug}</p><p className="mt-0.5 line-clamp-2 text-muted">{seoDesc || excerpt}</p></div>
        </div>
      </aside>
    </form>
  );
}
