import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { createAdminClient } from "@/lib/supabase/server";
import { parseOrNull, VisitPass } from "@/lib/jsonShapes";
import { visitTime } from "@/lib/visitors";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Visitor pass", robots: { index: false, follow: false } };

/** A visitor's pass, opened from their invitation email. Shows only their own visit. */
export default async function VisitorPass({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Z2-9]{32}$/.test(token)) notFound();
  const admin = createAdminClient();
  if (!admin) notFound();
  const { data } = await admin.rpc("visit_pass", { p_token: token });
  const pass = parseOrNull(VisitPass, data, "v/pass");
  if (!pass) notFound();
  const loc = pass.location;
  const map = loc?.lat != null && loc?.lng != null ? `https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}#map=17/${loc.lat}/${loc.lng}` : null;
  const status = {
    expected: { label: "Invited", tone: "bg-paper text-ink" },
    on_site: { label: `Signed in ${visitTime(pass.signed_in_at, pass.timezone)}`, tone: "bg-green-50 text-ok" },
    left: { label: "Visit finished", tone: "bg-paper text-muted" },
    cancelled: { label: "This visit was cancelled", tone: "bg-red-50 text-bad" },
    denied: { label: "Please speak to reception", tone: "bg-amber-50 text-warn" },
  }[pass.status] ?? { label: pass.status, tone: "bg-paper text-ink" };

  return (
    <main className="min-h-screen bg-paper px-4 py-8">
      <div className="mx-auto max-w-sm space-y-4">
        <div className="text-center"><Logo /></div>
        <section className="card space-y-4 text-center">
          <p className="eyebrow">Visitor pass · {pass.org}</p>
          <h1 className="text-2xl font-bold">{pass.name}</h1>
          <span className={`chip ${status.tone}`}>{status.label}</span>
          {(pass.status === "expected" || pass.status === "on_site") && <>
            <img src={`/api/visit-qr?t=${encodeURIComponent(token)}`} alt="QR code to scan at the reception tablet" width={220} height={220} className="mx-auto rounded-xl border border-line" />
            <p className="font-mono text-2xl font-extrabold tracking-[0.3em]">{pass.code}</p>
            <p className="text-sm text-muted">{pass.status === "on_site" ? "Use this code at the tablet to sign out when you leave." : "Scan this at the reception tablet, or type the code."}</p>
          </>}
        </section>
        <section className="card space-y-2 text-sm">
          {pass.expected_at && <p><b>When:</b> {visitTime(pass.expected_at, pass.timezone)}</p>}
          {loc && <p><b>Where:</b> {loc.name}{loc.address ? <><br /><span className="text-muted">{loc.address}</span></> : null}</p>}
          {pass.host && <p><b>Host:</b> {pass.host}</p>}
          {pass.purpose && <p><b>Purpose:</b> {pass.purpose}</p>}
          {map && <p><a className="font-semibold underline" href={map} target="_blank" rel="noreferrer">Map and directions</a></p>}
        </section>
        <p className="text-center text-xs text-muted">Keep this link private. Your details are deleted automatically after the company’s retention period.</p>
      </div>
    </main>
  );
}
