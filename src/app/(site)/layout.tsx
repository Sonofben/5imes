import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { CurrencyProvider } from "@/components/site/Currency";
import { loadCurrencies } from "@/lib/currencies";

/** The public website: home, product pages, pricing, blog, trust and legal pages. */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const currencies = await loadCurrencies();
  return (
    <CurrencyProvider list={currencies}>
      <div className="min-h-screen bg-[#faf9f6]">
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </div>
    </CurrencyProvider>
  );
}
