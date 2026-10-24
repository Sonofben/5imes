import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { parseOrNull, WalkinContext } from "@/lib/jsonShapes";
import { linkToken, VISIT_REASONS } from "@/lib/visitors";
import { WalkinFormCard } from "./WalkinFormCard";
import { brandTheme } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Visitor sign-in", robots: { index: false, follow: false } };

/**
 * Walk-in visitors scan the poster at reception and land here on their own phone. No account, no
 * app: they fill in their details and reception lets them in. The form only says which company and
 * office it is for; it lists no staff.
 */
export default async function WalkinPage({ params }: { params: Promise<{ link: string }> }) {
  const { link } = await params;
  const token = linkToken(link);
  if (!token) notFound();
  const admin = createAdminClient();
  if (!admin) notFound();
  const { data } = await admin.rpc("walkin_context", { p_link: token });
  if (!data) notFound(); // made-up or replaced link
  const ctx = parseOrNull(WalkinContext, data, "visit/context");
  if (!ctx) notFound();
  const theme = brandTheme(ctx.brand);

  return (
    <main className="min-h-screen bg-paper">
      <header className="flex items-center gap-3 px-5 py-4" style={{ background: theme.primary, color: theme.onPrimary }}>
        {ctx.brand?.logo_url && <img src={ctx.brand.logo_url} alt="" className="h-10 w-auto max-w-[110px] rounded-md bg-white/95 object-contain p-1" />}
        <div><p className="text-lg font-bold">{ctx.org.name}</p><p className="text-sm opacity-80">{ctx.location ?? "Reception"} · Visitor sign-in</p></div>
      </header>
      {theme.branded && <div aria-hidden className="h-1.5" style={{ background: theme.accent }} />}
      <div className="mx-auto max-w-md px-5 py-6">
        {ctx.open
          ? <WalkinFormCard button={{ background: theme.primary, color: theme.onPrimary }} link={token} reasons={VISIT_REASONS.map((r) => ({ ...r }))} rules={ctx.rules_text} notice={ctx.privacy_notice} />
          : <section className="card space-y-2 text-center"><h1 className="text-xl font-bold">Visitor sign-in is closed right now</h1>
              <p className="text-sm text-muted">Please speak to reception.</p></section>}
        <p className="mt-6 text-center text-xs text-muted">Invited? You don’t need this form — open the “I’ve arrived” link in your invitation email.<br />Your details are deleted automatically after {ctx.retention_days} days.</p>
      </div>
    </main>
  );
}
