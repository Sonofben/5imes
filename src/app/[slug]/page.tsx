import { notFound } from "next/navigation";
import type { Metadata } from "next";
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
  const brand = await loadBrand((await params).slug.toLowerCase());
  return { title: brand ? `${brand.name} · Staff portal` : "Not found" };
}

/** Company link, e.g. 5ime.ng/abc — the company's branded staff sign-in page. */
export default async function CompanyPortal({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const brand = await loadBrand((await params).slug.toLowerCase());
  if (!brand) notFound();
  const { msg, error } = readFlash(await searchParams);
  return <LoginForm brand={brand} initialError={error} initialNotice={msg} />;
}
