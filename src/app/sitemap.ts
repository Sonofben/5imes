import type { MetadataRoute } from "next";
import { publicOrigin } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicOrigin();
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/signup`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/login`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
