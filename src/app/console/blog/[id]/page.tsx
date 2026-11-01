import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConsole, can } from "@/lib/console";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { Reason } from "../../Reason";
import { PostEditor, type EditorPost } from "./PostEditor";
import { savePost, deletePost } from "../actions";

export const dynamic = "force-dynamic";

const EMPTY: EditorPost = { title: "", slug: "", excerpt: "", body: "", category: "guide", tags: "", author_name: "5ime team", seo_title: "", seo_description: "", faq: [], cover_url: null, status: "draft", published_at: null };

export default async function EditPost({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const flash = readFlash(await searchParams);
  const { supabase, role } = await requireConsole();
  if (!can.blog(role)) notFound();
  const isNew = id === "new";
  let post = EMPTY;
  if (!isNew) {
    if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
    const { data } = await supabase.rpc("console_blog_posts");
    const p = (data ?? []).find((x) => x.id === id);
    if (!p) notFound();
    post = { title: p.title, slug: p.slug, excerpt: p.excerpt, body: p.body, category: p.category, tags: (p.tags ?? []).join(", "), author_name: p.author_name,
      seo_title: p.seo_title ?? "", seo_description: p.seo_description ?? "", faq: Array.isArray(p.faq) ? (p.faq as { q: string; a: string }[]) : [],
      cover_url: p.cover_url, status: p.status, published_at: p.published_at };
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><Link href="/console/blog" className="text-sm text-muted underline">All posts</Link><h1 className="page-heading mt-1">{isNew ? "New post" : "Edit post"}</h1></div>
        {!isNew && post.status === "published" && <Link href={`/blog/${post.slug}`} target="_blank" className="btn-ghost btn-sm">View on site</Link>}
      </div>
      <Flash {...flash} />
      <PostEditor post={post} isNew={isNew} canPublish={can.writeBlog(role)} action={savePost.bind(null, isNew ? null : id)} />
      {!isNew && can.ownerOnly(role) && (
        <details className="card"><summary className="cursor-pointer font-semibold text-bad">Delete this post</summary>
          <form action={deletePost.bind(null, id)} className="mt-3 flex flex-wrap gap-2"><Reason /><button className="btn-ghost text-bad">Delete permanently</button></form>
        </details>
      )}
    </div>
  );
}
