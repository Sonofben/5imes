import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

/** The public website: home, product pages, pricing, blog, trust and legal pages. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#faf9f6]">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
