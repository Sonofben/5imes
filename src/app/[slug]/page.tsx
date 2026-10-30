import { notFound } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { loadPublicBrand } from "@/lib/publicBrand";
import { companyMetadata } from "@/lib/brandMeta";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "@/components/LoginForm";
import { readFlash } from "@/lib/flash";

export const dynamic = "force-dynamic";

async function loadBrand(slug: string) {
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("org_branding", { p_slug: slug });
  return (data ?? [])[0] ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const brand = await loadPublicBrand((await params).slug);
  if (!brand) return { title: "Not found" };
  return companyMetadata(brand, "Staff portal");
}

export async function generateViewport({ params }: { params: Promise<{ slug: string }> }): Promise<Viewport> {
  const brand = await loadPublicBrand((await params).slug);
  return brand?.full ? { themeColor: brand.theme.primary } : {};
}

/** Company link, e.g. 5ime.ng/abc — the company's branded staff sign-in page. */
export default async function CompanyPortal({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const slug = (await params).slug.toLowerCase();
  const [brand, pub] = await Promise.all([loadBrand(slug), loadPublicBrand(slug)]);
  if (!brand) notFound();
  const { msg, error } = readFlash(await searchParams);
  // Basic: the sign-in page keeps 5ime's look (company name only); Pro and Premium show the full brand.
  const shown = pub?.full ? brand : { ...brand, logo_url: null, brand_color: null, accent_color: null };
  return <LoginForm brand={shown} initialError={error} initialNotice={msg} />;
}
