import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { brandTheme, type BrandTheme } from "@/lib/brand";

export const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export type PublicBrand = { name: string; slug: string; logoUrl: string | null; theme: BrandTheme; full: boolean };

/**
 * A company's public brand, read without sign-in cookies (for the app icon, the install manifest and
 * the sign-in page). `full` is false on Basic: then only 5ime's own look is used outside the app.
 */
export async function loadPublicBrand(slugIn: string): Promise<PublicBrand | null> {
  const slug = slugIn.toLowerCase();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!SLUG.test(slug) || !url || !key) return null;
  const supabase = createClient<Database>(url, key, { auth: { persistSession: false } });
  const [{ data: rows }, { data: level }] = await Promise.all([
    supabase.rpc("org_branding", { p_slug: slug }),
    supabase.rpc("org_brand_level", { p_slug: slug }),
  ]);
  const row = rows?.[0];
  if (!row) return null;
  return {
    name: row.name, slug: row.slug, logoUrl: row.logo_url ?? null, full: level === "full",
    theme: brandTheme({ primary: row.brand_color, accent: row.accent_color }),
  };
}

/** Our own logo storage only — never fetch a URL that points anywhere else. */
export function isOwnLogoUrl(u: string | null): u is string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return !!u && !!base && u.startsWith(`${base.replace(/\/$/, "")}/storage/v1/object/public/logos/`);
}
