import Link from "next/link";
import { Logo } from "@/components/Logo";
import { BRAND } from "@/lib/constants";

export type LegalSection = { heading: string; body: React.ReactNode };

export function LegalPage({ title, updated, intro, sections }: { title: string; updated: string; intro: React.ReactNode; sections: LegalSection[] }) {
  return (
    <main className="min-h-screen bg-paper">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-6 sm:px-8">
        <Logo />
        <nav className="flex gap-4 text-sm font-semibold">
          <Link href="/privacy" className="hover:text-brand-dark">Privacy</Link>
          <Link href="/terms" className="hover:text-brand-dark">Terms</Link>
          <Link href="/login" className="hover:text-brand-dark">Sign in</Link>
        </nav>
      </header>
      <article className="mx-auto max-w-3xl space-y-6 px-5 pb-16 sm:px-8">
        <div>
          <p className="eyebrow">Last updated {updated}</p>
          <h1 className="page-heading mt-1">{title}</h1>
        </div>
        <div className="space-y-3 text-[15px] leading-7 text-ink/85">{intro}</div>
        {sections.map((s, i) => (
          <section key={s.heading} className="space-y-2">
            <h2 className="text-lg font-bold">{i + 1}. {s.heading}</h2>
            <div className="space-y-2 text-[15px] leading-7 text-ink/85 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">{s.body}</div>
          </section>
        ))}
        <p className="border-t border-line pt-6 text-sm text-muted">
          Questions? Email <a className="font-semibold text-ink underline" href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a>.
          {" "}{BRAND.name} is a product of Kora Forge Solutions, Lagos, Nigeria.
        </p>
      </article>
    </main>
  );
}
