import "server-only";
import { createClient as createPlainClient } from "@supabase/supabase-js";

export type FaqEntry = { q: string; a: string };
export type Post = {
  id: string; slug: string; title: string; excerpt: string; body: string; category: Category; tags: string[];
  cover_url: string | null; author_name: string; seo_title: string | null; seo_description: string | null;
  faq: FaqEntry[]; published_at: string; updated_at: string;
};
export type PostCard = Omit<Post, "body" | "faq">;

export const CATEGORIES = {
  comparison: "Comparisons",
  guide: "Guides",
  product: "Product",
  news: "News",
} as const;
export type Category = keyof typeof CATEGORIES;

const CARD = "id,slug,title,excerpt,category,tags,cover_url,author_name,seo_title,seo_description,published_at,updated_at";

/** Public reads use the anonymous key; the database only returns published posts. */
function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createPlainClient(url, key, { auth: { persistSession: false } });
}

// Short cache so busy pages do not become database load. Writers see changes within a minute.
const cache = new Map<string, { at: number; value: unknown }>();
const TTL = 60_000;
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value as T;
  const value = await load();
  // Empty results are not kept, so a new post or a brief database hiccup is not remembered.
  if (value !== null && !(Array.isArray(value) && value.length === 0)) cache.set(key, { at: Date.now(), value });
  return value;
}

export async function listPosts(opts: { category?: Category; limit?: number } = {}): Promise<PostCard[]> {
  return cached(`list:${opts.category ?? ""}:${opts.limit ?? ""}`, async () => {
    const c = client();
    if (!c) return [];
    let q = c.from("blog_posts").select(CARD).order("published_at", { ascending: false }).limit(opts.limit ?? 100);
    if (opts.category) q = q.eq("category", opts.category);
    const { data } = await q;
    return (data ?? []) as PostCard[];
  });
}

export async function getPost(slug: string): Promise<Post | null> {
  if (!/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/.test(slug)) return null;
  return cached(`post:${slug}`, async () => {
    const c = client();
    if (!c) return null;
    const { data } = await c.from("blog_posts").select(`${CARD},body,faq`).eq("slug", slug).maybeSingle();
    if (!data) return null;
    const faq = Array.isArray(data.faq) ? (data.faq as unknown[]).filter((f): f is FaqEntry => !!f && typeof (f as FaqEntry).q === "string" && typeof (f as FaqEntry).a === "string") : [];
    return { ...(data as Omit<Post, "faq">), faq };
  });
}

export function fmtPostDate(iso: string) {
  return new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" }).format(new Date(iso));
}
