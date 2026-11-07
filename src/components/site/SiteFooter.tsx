import Link from "next/link";
import { Logo } from "@/components/Logo";
import { BRAND, CONTACT } from "@/lib/constants";

const COLUMNS = [
  { title: "Product", links: [["/attendance", "Attendance"], ["/visitor-management", "Visitor management"], ["/field-staff", "Field staff"], ["/leave-tasks-celebrations", "Leave, tasks and celebrations"], ["/pricing", "Pricing"]] },
  { title: "Compare", links: [["/blog/jibble-alternative-5ime-vs-jibble", "5ime vs Jibble"], ["/blog/connecteam-alternative-5ime-vs-connecteam", "5ime vs Connecteam"], ["/blog/fingerprint-attendance-vs-phone-check-in", "Fingerprint machines vs phones"], ["/blog/paper-visitor-register-vs-digital-visitor-management", "Paper visitor book vs digital"], ["/blog?category=comparison", "All comparisons"]] },
  { title: "Company", links: [["/about", "About"], ["/contact", "Contact us"], ["/blog", "Blog"], ["/login", "Sign in"]] },
  { title: "Trust", links: [["/security", "Security and trust"], ["/privacy", "Privacy notice"], ["/terms", "Terms of service"]] },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-[#f4f3ef]">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1.2fr_repeat(4,minmax(0,1fr))]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm leading-6 text-muted">Attendance and visitor management for teams in the office, at home and in the field.</p>
          <p className="text-sm"><a href={`mailto:${CONTACT.info}`} className="font-semibold hover:text-brand-dark">{CONTACT.info}</a></p>
        </div>
        {COLUMNS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">{c.title}</p>
            <ul className="mt-3 space-y-2 text-sm">{c.links.map(([href, label]) => <li key={href}><Link href={href} className="text-ink/80 hover:text-brand-dark">{label}</Link></li>)}</ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-xs text-muted sm:px-8">
          <span>© {new Date().getFullYear()} {BRAND.name}. All rights reserved.</span>
          <span>{BRAND.name} is a product of {BRAND.legalOwner}, registered with the Corporate Affairs Commission ({BRAND.cacNumber}). {BRAND.address}.</span>
        </div>
      </div>
    </footer>
  );
}
