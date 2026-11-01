import Link from "next/link";
import { Logo } from "@/components/Logo";

export const NAV = [
  { href: "/attendance", label: "Attendance" },
  { href: "/visitor-management", label: "Visitor management" },
  { href: "/field-staff", label: "Field staff" },
  { href: "/pricing", label: "Pricing" },
  { href: "/blog", label: "Blog" },
  { href: "/security", label: "Security" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-[#faf9f6]/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => <Link key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-white hover:text-ink">{n.label}</Link>)}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden px-3 py-2 text-sm font-semibold text-ink hover:text-brand-dark sm:inline-flex">Sign in</Link>
          <Link href="/signup" className="btn-brand btn-sm">Start free trial</Link>
          <details className="relative lg:hidden">
            <summary aria-label="Menu" className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg border border-line bg-white text-lg">≡</summary>
            <nav aria-label="Mobile" className="absolute right-0 mt-2 w-64 rounded-2xl border border-line bg-white p-2 shadow-xl">
              {NAV.map((n) => <Link key={n.href} href={n.href} className="block rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-paper">{n.label}</Link>)}
              <Link href="/contact" className="block rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-paper">Talk to sales</Link>
              <Link href="/login" className="block rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-paper">Sign in</Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
