"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminNav({ isAdmin, pendingCount }: { isAdmin: boolean; pendingCount: number }) {
  const path = usePathname();
  const items = [
    { href: "/admin", label: "Today" },
    { href: "/admin/staff", label: "Staff", badge: pendingCount },
    { href: "/admin/reports", label: "Reports" },
    ...(isAdmin
      ? [
          { href: "/admin/locations", label: "Locations" },
          { href: "/admin/schedule", label: "Schedule" },
          { href: "/admin/settings", label: "Settings" },
          { href: "/admin/billing", label: "Billing" },
        ]
      : []),
  ];
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1">
      {items.map((i) => {
        const active = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={`relative whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
              active ? "bg-ink text-white" : "text-muted hover:bg-white hover:text-ink"
            }`}
          >
            {i.label}
            {!!i.badge && (
              <span className="ml-1.5 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">{i.badge}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
