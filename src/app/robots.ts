import type { MetadataRoute } from "next";
import { isStaging, publicOrigin } from "@/lib/site";

// Read at request time so the staging copy (APP_ENV=staging) can refuse every crawler.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (isStaging()) return { rules: [{ userAgent: "*", disallow: ["/"] }] };
  return {
    rules: [{
      userAgent: "*",
      allow: ["/", "/login", "/signup"],
      // Signed-in areas and auth plumbing have nothing for search engines.
      disallow: ["/admin", "/app", "/visitors", "/visit/", "/v/", "/kiosk", "/console", "/start", "/onboarding", "/pending", "/auth/", "/api/", "/preview"],
    }],
    sitemap: `${publicOrigin()}/sitemap.xml`,
    host: publicOrigin(),
  };
}
