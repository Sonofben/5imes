import type { MetadataRoute } from "next";
import { publicOrigin } from "@/lib/site";
import { listPosts } from "@/lib/blog";

// Built per request so new blog posts appear as soon as they are published.
export const dynamic = "force-dynamic";

const PAGES: [string, number, MetadataRoute.Sitemap[number]["changeFrequency"]][] = [
  ["/", 1, "weekly"], ["/attendance", 0.9, "monthly"], ["/visitor-management", 0.9, "monthly"], ["/field-staff", 0.8, "monthly"],
  ["/leave-tasks-celebrations", 0.6, "monthly"], ["/pricing", 0.9, "monthly"], ["/blog", 0.8, "weekly"], ["/security", 0.7, "monthly"],
  ["/about", 0.5, "yearly"], ["/contact", 0.6, "yearly"], ["/signup", 0.7, "yearly"], ["/privacy", 0.3, "yearly"], ["/terms", 0.3, "yearly"],
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicOrigin();
  const posts = await listPosts().catch(() => []);
  return [
    ...PAGES.map(([path, priority, changeFrequency]) => ({ url: `${base}${path}`, priority, changeFrequency })),
    ...posts.map((p) => ({ url: `${base}/blog/${p.slug}`, lastModified: p.updated_at, changeFrequency: "monthly" as const, priority: p.category === "comparison" ? 0.8 : 0.6 })),
  ];
}
