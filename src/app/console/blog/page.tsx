import Link from "next/link";
import { requireConsole, can, fmtDate } from "@/lib/console";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { friendly } from "@/lib/errors";

export const dynamic = "force-dynamic";

const CAT: Record<string, string> = { comparison: "Comparison", guide: "Guide", product: "Product", news: "News" };

export default async function ConsoleBlog({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const flash = readFlash(await searchParams);
  const { supabase, role } = await requireConsole();
  if (!can.blog(role)) return <p className="card">Your role cannot open the blog.</p>;
  const { data, error } = await supabase.rpc("console_blog_posts");
  const posts = data ?? [];
  const now = Date.now();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="page-heading">Blog</h1><p className="text-sm text-muted">Posts on 5imes.click/blog. Comparisons go in the Comparison category.</p></div>
        {can.writeBlog(role) && <Link href="/console/blog/new" className="btn-primary">New post</Link>}
      </div>
      <Flash {...flash} />
      {error && <p className="card text-bad">{friendly(error, "console/blog")}</p>}
      <div className="card overflow-x-auto p-0"><table className="table min-w-[760px]">
        <thead><tr><th>Title</th><th>Category</th><th>Status</th><th>Published</th><th>Updated</th></tr></thead>
        <tbody>{posts.length === 0 ? <tr><td colSpan={5} className="text-muted">No posts yet.</td></tr> : posts.map((p) => {
          const live = p.status === "published" && p.published_at && new Date(p.published_at).getTime() <= now;
          const label = p.status === "draft" ? ["Draft", "bg-paper text-muted"] : live ? ["Live", "bg-green-50 text-ok"] : ["Scheduled", "bg-amber-50 text-warn"];
          return <tr key={p.id}>
            <td><Link href={`/console/blog/${p.id}`} className="font-semibold underline">{p.title}</Link><div className="text-xs text-muted">/blog/{p.slug}</div></td>
            <td>{CAT[p.category] ?? p.category}</td>
            <td><span className={`chip ${label[1]}`}>{label[0]}</span></td>
            <td>{fmtDate(p.published_at)}</td>
            <td>{fmtDate(p.updated_at)}</td>
          </tr>;
        })}</tbody>
      </table></div>
    </div>
  );
}
