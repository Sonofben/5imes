import { NextResponse } from "next/server";
import { loadPublicBrand } from "@/lib/publicBrand";

/**
 * The install manifest for a company on Pro or Premium: when staff add 5ime to their phone, the
 * icon is the company's and the name is the company's. Basic gets 5ime's own manifest.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("o") ?? "";
  const brand = await loadPublicBrand(slug);
  if (!brand || !brand.full) return NextResponse.redirect(new URL("/manifest.webmanifest", url), 302);
  const icon = (s: number, m = false) => `/api/brand/icon?o=${brand.slug}&s=${s}${m ? "&m=1" : ""}`;
  const manifest = {
    name: `${brand.name} · Attendance`,
    short_name: brand.name.length > 12 ? brand.name.split(/\s+/)[0]!.slice(0, 12) : brand.name,
    description: `Check in for work at ${brand.name}.`,
    id: `/app?o=${brand.slug}`,
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: brand.theme.primary,
    icons: [
      { src: icon(192), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: icon(512), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: icon(512, true), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return NextResponse.json(manifest, {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  });
}
