import Link from "next/link";

export function CtaBand({ title = "See who’s in by tomorrow morning.", text }: { title?: string; text?: string }) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
      <div className="grid gap-6 rounded-[1.75rem] bg-ink px-6 py-10 text-white sm:px-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
          <p className="mt-2 max-w-2xl text-white/75">{text ?? "Start a free trial with every Pro feature. No card needed. Most teams are set up in about ten minutes."}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/signup" className="btn-brand px-5">Start free trial</Link>
          <Link href="/contact" className="inline-flex items-center rounded-xl border border-white/30 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10">Talk to sales</Link>
        </div>
      </div>
    </section>
  );
}
