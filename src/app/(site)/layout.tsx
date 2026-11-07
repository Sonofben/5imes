import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { CurrencyProvider } from "@/components/site/Currency";
import { JsonLd } from "@/components/site/JsonLd";
import { loadCurrencies } from "@/lib/currencies";
import { BRAND, CONTACT, SOCIAL_PROFILES } from "@/lib/constants";
import { publicOrigin } from "@/lib/site";

/** The public website: home, product pages, pricing, blog, trust and legal pages. */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const currencies = await loadCurrencies();
  const origin = publicOrigin();
  // Who 5ime is, on every page, so search engines and AI assistants treat it as one known company.
  const org = {
    "@context": "https://schema.org", "@type": "Organization", "@id": `${origin}/#organization`,
    name: BRAND.name, alternateName: BRAND.alternateNames, url: origin, logo: `${origin}/icon-512.png`, email: CONTACT.info,
    description: "5ime is staff attendance and visitor management software: GPS check in at approved offices, approved homes and client sites, and visitors who sign in on their own phone.",
    foundingLocation: { "@type": "Place", name: "Lagos, Nigeria" },
    address: { "@type": "PostalAddress", ...BRAND.postalAddress },
    parentOrganization: { "@type": "Organization", name: BRAND.legalOwner },
    contactPoint: [
      { "@type": "ContactPoint", contactType: "customer support", email: CONTACT.support, availableLanguage: "en" },
      { "@type": "ContactPoint", contactType: "sales", email: CONTACT.sales, availableLanguage: "en" },
    ],
    ...(SOCIAL_PROFILES.length ? { sameAs: SOCIAL_PROFILES } : {}),
  };
  const site = { "@context": "https://schema.org", "@type": "WebSite", "@id": `${origin}/#website`, name: BRAND.name, alternateName: BRAND.alternateNames, url: origin, publisher: { "@id": `${origin}/#organization` } };
  return (
    <CurrencyProvider list={currencies}>
      <JsonLd data={[org, site]} />
      <div className="min-h-screen bg-[#faf9f6]">
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </div>
    </CurrencyProvider>
  );
}
