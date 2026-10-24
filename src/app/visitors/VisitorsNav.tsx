"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function VisitorsNav({ items, waiting }: { items: { href: string; label: string }[]; waiting: number }) {
  const path = usePathname();
  const active = (href: string) => (href === "/visitors" ? path === href : path.startsWith(href));
  return (
    <nav aria-label="Visitor sections" className="-mx-1 flex gap-1 overflow-x-auto border-b border-line print:hidden">
      {items.map((t) => (
        <Link key={t.href} href={t.href} aria-current={active(t.href) ? "page" : undefined}
          className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold ${active(t.href) ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}>
          {t.label}
          {t.href === "/visitors" && waiting > 0 && <span aria-label={`${waiting} waiting`} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-warn">{waiting}</span>}
        </Link>
      ))}
    </nav>
  );
}
