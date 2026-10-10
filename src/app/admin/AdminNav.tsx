"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; badge?: number; badgeLabel?: string };

export function AdminNav({ isAdmin, pendingPeople, pendingCorrections }: { isAdmin: boolean; pendingPeople: number; pendingCorrections: number }) {
  const path = usePathname();
  const groups: { label: string; items: Item[] }[] = [
    { label: "Workspace", items: [
      { href: "/admin", label: "Today" },
      { href: "/admin/staff", label: "People", badge: pendingPeople, badgeLabel: `${pendingPeople} people waiting for approval` },
      { href: "/admin/attendance-corrections", label: "Corrections", badge: pendingCorrections, badgeLabel: `${pendingCorrections} attendance requests awaiting review` },
      { href: "/admin/reports", label: "Reports" },
    ] },
    ...(isAdmin ? [
      { label: "Operations", items: [
        { href: "/admin/locations", label: "Locations" },
        { href: "/admin/schedule", label: "Schedule" },
      ] },
      { label: "Organization", items: [
        { href: "/admin/settings", label: "Settings" },
        { href: "/admin/billing", label: "Billing" },
      ] },
    ] : []),
  ];
  const items = groups.flatMap((group) => group.items);
  const active = (href: string) => href === "/admin" ? path === href : path.startsWith(href);
  const current = items.find((item) => active(item.href));

  return (
    <>
      <div className="-mx-4 px-4 pb-1 lg:hidden">
        <details className="group overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
          <summary aria-label={`Navigation menu. Current page: ${current?.label ?? "Workspace"}. Expand to see all destinations.`} className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0"><span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Navigation · {items.length} pages</span><span className="mt-0.5 flex items-center gap-2 text-sm font-semibold">{current?.label ?? "Workspace"}{!!current?.badge && <span aria-label={current.badgeLabel} className="chip min-h-5 bg-brand-dark px-2 py-0 text-[10px] text-white">{current.badge} to review</span>}</span></span>
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-muted transition-transform group-open:rotate-180"><path d="m5 7.5 5 5 5-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7"/></svg>
          </summary>
          <nav aria-label="Admin navigation" className="space-y-4 border-t border-line px-3 py-3">
            {groups.map((group) => <div key={group.label}><h2 className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{group.label}</h2><div className="grid grid-cols-2 gap-1">{group.items.map((item) => <Link key={item.href} href={item.href} aria-current={active(item.href) ? "page" : undefined} className={`flex min-h-10 items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-sm font-medium ${active(item.href) ? "bg-[#f4f3ef] text-ink" : "text-muted hover:bg-[#fafbf9] hover:text-ink"}`}><span>{item.label}</span>{!!item.badge && <span aria-label={item.badgeLabel} className="rounded-full bg-brand-dark px-2 py-0.5 text-[10px] font-bold text-white">{item.badge}</span>}</Link>)}</div></div>)}
          </nav>
        </details>
      </div>

      <aside className="hidden lg:block">
        <nav aria-label="Admin navigation" className="sticky top-6 space-y-6 rounded-2xl border border-line bg-white p-3 shadow-sm">
          {groups.map((group) => <div key={group.label}><h2 className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{group.label}</h2><div className="space-y-1">{group.items.map((item) => <Link key={item.href} href={item.href} aria-current={active(item.href) ? "page" : undefined} className={`flex min-h-10 items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition-colors ${active(item.href) ? "bg-[#f4f3ef] text-ink" : "text-muted hover:bg-[#fafbf9] hover:text-ink"}`}><span>{item.label}</span>{!!item.badge && <span aria-label={item.badgeLabel} className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-bold text-brand-dark">{item.badge}</span>}</Link>)}</div></div>)}
        </nav>
      </aside>
    </>
  );
}
