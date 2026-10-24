import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { requireMember } from "@/lib/session";
import { visitorLinkUrl } from "@/lib/visitors";
import { PrintButton } from "../on-site/PrintButton";

export const dynamic = "force-dynamic";

/** The A4 poster for reception: walk-in visitors scan it to sign in on their own phone. */
export default async function PosterPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  // Reception-only staff go back to the desk; admins must also pass two-factor (requireMember admin).
  if (!(await requireMember({ desk: true })).isAdmin) redirect("/visitors");
  const { supabase, org } = await requireMember({ admin: true });
  if (!sp.office || !/^[0-9a-f-]{36}$/.test(sp.office)) notFound();
  const [{ data: office }, { data: link }] = await Promise.all([
    supabase.from("locations").select("id,name").eq("org_id", org.id).eq("id", sp.office).maybeSingle(),
    supabase.from("visitor_links").select("token").eq("org_id", org.id).eq("location_id", sp.office).is("revoked_at", null).maybeSingle(),
  ]);
  if (!office || !link) notFound();
  const url = visitorLinkUrl(org.slug, link.token);
  // Our own URL encoded as an SVG by the qrcode library; nothing from the visitor goes into it.
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#182126", light: "#ffffff" } });
  const shortUrl = url.replace(/^https?:\/\//, "");

  return (
    <div className="space-y-4">
      <style>{`@page { size: A4; margin: 12mm; } @media print { body { background: #fff; } .poster { box-shadow: none !important; border: 0 !important; width: 100% !important; } }`}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/visitors/settings" className="text-sm text-muted underline">← Settings</Link>
        <PrintButton />
      </div>
      <article className="poster mx-auto flex max-w-[640px] flex-col overflow-hidden rounded-3xl border border-line bg-paper shadow-sm">
        <header className="bg-[#1b2127] px-10 py-7 text-white">
          <p className="text-3xl font-extrabold">{org.name}</p>
          <p className="text-base text-[#d6dbde]">{office.name} · Visitor sign-in</p>
        </header>
        <div className="flex flex-col items-center gap-5 px-10 py-9 text-center">
          <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tight">No invitation?<br />Scan to sign in.</h1>
          <p className="text-lg text-muted">Open your phone camera and point it here.<br />Fill in your details and reception will let you in.</p>
          <div className="w-[280px] rounded-3xl border border-line bg-white p-5" role="img" aria-label="QR code that opens the visitor sign-in form"
            dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="font-mono text-sm text-muted">{shortUrl}</p>
          <p className="w-full rounded-2xl border border-line bg-white px-5 py-4 text-base"><b>Invited?</b> You don’t need to scan this. Open the <b>“I’ve arrived”</b> link in your invitation email.</p>
        </div>
        <footer className="flex justify-between border-t border-line px-10 py-3 text-xs text-muted">
          <span>Your details are used only to manage this visit.</span><span>Powered by 5imes</span>
        </footer>
      </article>
    </div>
  );
}
