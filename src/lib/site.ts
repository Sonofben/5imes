/**
 * Canonical public origin for redirects and payment callbacks.
 * Production must set NEXT_PUBLIC_SITE_URL so redirects never follow a spoofed Host header.
 */
export function siteUrl(request?: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_SITE_URL is not set. Set it to the public https:// address and rebuild.");
  }
  return request ? new URL(request.url).origin : "http://localhost:3000";
}

/** Public origin for SEO metadata (robots, sitemap, canonical). Never throws. */
export function publicOrigin() {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") || "http://localhost:3000";
}

/**
 * True on the staging copy (APP_ENV=staging in its .env). Staging shows a banner on every page,
 * tells search engines to stay away and marks its emails, so nobody mistakes it for the live site.
 */
export function isStaging() {
  return process.env.APP_ENV === "staging";
}
