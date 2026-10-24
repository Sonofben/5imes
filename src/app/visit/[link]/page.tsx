import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { parseOrNull, WalkinContext } from "@/lib/jsonShapes";
import { linkToken, VISIT_REASONS } from "@/lib/visitors";
import { WalkinFormCard } from "./WalkinFormCard";

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
  const ctx = parseOrNull(WalkinContext, data, "visit/context");
  if (!ctx) notFound();

  return (
    <main className="min-h-screen bg-paper">
      <header className="bg-[#1b2127] px-5 py-4 text-white">
        <p className="text-lg font-bold">{ctx.org.name}</p>
        <p className="text-sm text-[#d6dbde]">{ctx.location ?? "Reception"} · Visitor sign-in</p>
      </header>
      <div className="mx-auto max-w-md px-5 py-6">
        {ctx.open
          ? <WalkinFormCard link={token} reasons={VISIT_REASONS.map((r) => ({ ...r }))} rules={ctx.rules_text} notice={ctx.privacy_notice} />
          : <section className="card space-y-2 text-center"><h1 className="text-xl font-bold">Visitor sign-in is closed right now</h1>
              <p className="text-sm text-muted">Please speak to reception.</p></section>}
        <p className="mt-6 text-center text-xs text-muted">Invited? You don’t need this form — open the “I’ve arrived” link in your invitation email.<br />Your details are deleted automatically after {ctx.retention_days} days.</p>
      </div>
    </main>
  );
}
