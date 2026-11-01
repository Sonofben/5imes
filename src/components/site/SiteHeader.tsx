"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Logo } from "@/components/Logo";

export const FEATURES = [
  { href: "/attendance", label: "Attendance", text: "GPS check in at the office or an approved home" },
  { href: "/visitor-management", label: "Visitor management", text: "Visitors sign in on their own phone" },
  { href: "/field-staff", label: "Field staff", text: "Proof of every client visit" },
  { href: "/leave-tasks-celebrations", label: "Leave, tasks and celebrations", text: "Included in every plan" },
] as const;

const LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/blog", label: "Blog" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

/** Closes an open <details> menu after navigating to another page. */
function useCloseOnNavigate() {
  const ref = useRef<HTMLDetailsElement>(null);
  const path = usePathname();
  useEffect(() => { if (ref.current) ref.current.open = false; }, [path]);
  // Also close it when someone clicks elsewhere on the page or presses Escape.
  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", close); };
  }, []);
  return ref;
}

export function SiteHeader() {
  const features = useCloseOnNavigate();
  const mobile = useCloseOnNavigate();
  const path = usePathname();
  const on = (href: string) => path === href || path.startsWith(href + "/");
  const item = (active: boolean) => `rounded-lg px-3 py-2 text-sm font-medium hover:bg-white hover:text-ink ${active ? "text-ink" : "text-muted"}`;
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-[#faf9f6]/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          <Link href="/" className={item(path === "/")}>Home</Link>
          <details ref={features} className="relative">
            <summary className={`${item(FEATURES.some((f) => on(f.href)))} flex cursor-pointer list-none items-center gap-1`}>Features <span aria-hidden className="text-xs">▾</span></summary>
            <div className="absolute left-0 mt-2 w-80 rounded-2xl border border-line bg-white p-2 shadow-xl">
              {FEATURES.map((f) => (
                <Link key={f.href} href={f.href} className="block rounded-xl px-3 py-2.5 hover:bg-paper">
                  <span className="block text-sm font-semibold text-ink">{f.label}</span>
                  <span className="block text-xs text-muted">{f.text}</span>
                </Link>
              ))}
            </div>
          </details>
          {LINKS.map((n) => <Link key={n.href} href={n.href} className={item(on(n.href))}>{n.label}</Link>)}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden px-3 py-2 text-sm font-semibold text-ink hover:text-brand-dark sm:inline-flex">Sign in</Link>
          <Link href="/signup" className="btn-brand btn-sm">Start free trial</Link>
          <details ref={mobile} className="relative lg:hidden">
            <summary aria-label="Menu" className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg border border-line bg-white text-lg">≡</summary>
            <nav aria-label="Mobile" className="absolute right-0 mt-2 w-72 rounded-2xl border border-line bg-white p-2 shadow-xl">
              <Link href="/" className="block rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-paper">Home</Link>
              <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Features</p>
              {FEATURES.map((f) => <Link key={f.href} href={f.href} className="block rounded-lg px-3 py-2 pl-5 text-sm hover:bg-paper">{f.label}</Link>)}
              <div className="my-1 border-t border-line" />
              {LINKS.map((n) => <Link key={n.href} href={n.href} className="block rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-paper">{n.label}</Link>)}
              <Link href="/login" className="block rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-paper">Sign in</Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
