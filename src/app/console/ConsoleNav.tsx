"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  ["/console", "Overview"], ["/console/companies", "Companies"], ["/console/revenue", "Revenue"], ["/console/people", "People"],
  ["/console/security", "Security"], ["/console/announcements", "Announcements"], ["/console/pricing", "Plans & pricing"],
  ["/console/team", "Team"], ["/console/audit", "Audit log"],
] as const;

export function ConsoleNav() {
  const path = usePathname();
  const active = (href: string) => (href === "/console" ? path === href : path.startsWith(href));
  return (
    <nav aria-label="Global Admin" className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2 text-sm sm:px-6">
      {ITEMS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}
          className={`shrink-0 rounded-lg px-3 py-1.5 ${active(href) ? "bg-white/15 font-semibold text-white" : "text-white/75 hover:bg-white/10"}`}>{label}</Link>
      ))}
    </nav>
  );
}
