"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  ["/console", "Overview"], ["/console/companies", "Companies"], ["/console/revenue", "Revenue"], ["/console/people", "People"],
  ["/console/security", "Security"], ["/console/announcements", "Announcements"], ["/console/pricing", "Plans & pricing"], ["/console/holidays", "Holidays"],
  ["/console/enquiries", "Sales enquiries"], ["/console/blog", "Blog"], ["/console/team", "Team"], ["/console/audit", "Audit log"],
] as const;

export function ConsoleNav({ role }: { role: string | null }) {
  const path = usePathname();
  // Blog writers see only the blog; everyone else sees everything except what their role can't open.
  const items = ITEMS.filter(([href]) => role === "writer" ? href === "/console/blog" : href !== "/console/enquiries" || role !== "viewer");
  const active = (href: string) => (href === "/console" ? path === href : path.startsWith(href));
  return (
    <nav aria-label="Global Admin" className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2 text-sm sm:px-6">
      {items.map(([href, label]) => (
        <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}
          className={`shrink-0 rounded-lg px-3 py-1.5 ${active(href) ? "bg-white/15 font-semibold text-white" : "text-white/75 hover:bg-white/10"}`}>{label}</Link>
      ))}
    </nav>
  );
}
