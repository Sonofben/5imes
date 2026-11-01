import type { MetadataRoute } from "next";
import { isStaging, publicOrigin } from "@/lib/site";

// Read at request time so the staging copy (APP_ENV=staging) can refuse every crawler.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (isStaging()) return { rules: [{ userAgent: "*", disallow: ["/"] }] };
  const disallow = ["/admin", "/app", "/tasks", "/visitors", "/visit/", "/v/", "/c/", "/kiosk", "/console", "/start", "/onboarding", "/pending", "/auth/", "/api/", "/preview"];
  return {
    rules: [
      // Signed-in areas, company sign-in pages and auth plumbing have nothing for search engines.
      { userAgent: "*", allow: ["/"], disallow },
      // AI answer engines may read the public site so they can quote it accurately.
      { userAgent: ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Google-Extended", "Applebot-Extended", "Bingbot"], allow: ["/"], disallow },
    ],
    sitemap: `${publicOrigin()}/sitemap.xml`,
    host: publicOrigin(),
  };
}
