import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Console", robots: { index: false, follow: false } };

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f3f2ee]">
      <header className="border-b border-line bg-ink text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3"><span className="text-lg font-extrabold"><span className="text-brand">5</span>ime</span><span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider">Console</span></div>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/console" className="rounded-lg px-3 py-1.5 hover:bg-white/10">Overview</Link>
            <Link href="/console/companies" className="rounded-lg px-3 py-1.5 hover:bg-white/10">Companies</Link>
            <Link href="/console/audit" className="rounded-lg px-3 py-1.5 hover:bg-white/10">Audit log</Link>
            <form action="/auth/signout" method="post"><button className="rounded-lg px-3 py-1.5 text-white/70 hover:bg-white/10">Sign out</button></form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
