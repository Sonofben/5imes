import type { MetadataRoute } from "next";
import { publicOrigin } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      allow: ["/", "/login", "/signup"],
      // Signed-in areas and auth plumbing have nothing for search engines.
      disallow: ["/admin", "/app", "/console", "/start", "/onboarding", "/pending", "/auth/", "/api/", "/preview"],
    }],
    sitemap: `${publicOrigin()}/sitemap.xml`,
    host: publicOrigin(),
  };
}
