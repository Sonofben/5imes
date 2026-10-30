import type { Metadata } from "next";
import type { PublicBrand } from "@/lib/publicBrand";

/**
 * Browser tab and phone-install details for a company on Pro or Premium: its name in the tab title,
 * its icon in the tab and on the home screen, and its own install manifest. Basic keeps 5ime's.
 */
export function companyMetadata(brand: PublicBrand | null, title: string): Metadata {
  if (!brand || !brand.full) return { title };
  const icon = (s: number) => `/api/brand/icon?o=${brand.slug}&s=${s}`;
  return {
    title: { absolute: `${brand.name} · ${title}` },
    applicationName: brand.name,
    manifest: `/api/brand/manifest?o=${brand.slug}`,
    appleWebApp: { capable: true, title: brand.name, statusBarStyle: "default" },
    icons: { icon: [{ url: icon(64), sizes: "64x64", type: "image/png" }, { url: icon(192), sizes: "192x192", type: "image/png" }], apple: [{ url: icon(180), sizes: "180x180", type: "image/png" }] },
  };
}
