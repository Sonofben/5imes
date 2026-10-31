"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function TasksNav({ items, review }: { items: { href: string; label: string }[]; review: number }) {
  const path = usePathname();
  const scope = useSearchParams().get("scope");
  const active = (href: string) => {
    const [p, q] = href.split("?");
    if (p !== "/tasks") return path.startsWith(p);
    return path === "/tasks" && (q ? q === `scope=${scope}` : !scope);
  };
  return (
    <nav aria-label="Task views" className="-mx-1 flex gap-1 overflow-x-auto border-b border-line">
      {items.map((t) => (
        <Link key={t.href} href={t.href} aria-current={active(t.href) ? "page" : undefined}
          className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold ${active(t.href) ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}>
          {t.label}
          {t.href === "/tasks?scope=created" && review > 0 && <span aria-label={`${review} waiting for review`} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-warn">{review}</span>}
        </Link>
      ))}
    </nav>
  );
}
