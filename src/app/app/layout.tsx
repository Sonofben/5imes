import type { Metadata, Viewport } from "next";
import { requireMember } from "@/lib/session";
import { loadPublicBrand } from "@/lib/publicBrand";
import { companyMetadata } from "@/lib/brandMeta";

// The staff app shows the company's name and icon in the browser tab and when added to a phone (Pro and Premium).
async function myBrand() {
  const { org } = await requireMember({ allowAal1: true });
  return loadPublicBrand(org.slug);
}

export async function generateMetadata(): Promise<Metadata> {
  return companyMetadata(await myBrand(), "Check in");
}

export async function generateViewport(): Promise<Viewport> {
  const brand = await myBrand();
  return brand?.full ? { themeColor: brand.theme.primary } : {};
}

export default function StaffAppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
