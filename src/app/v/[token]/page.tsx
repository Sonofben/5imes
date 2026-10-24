import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { createAdminClient } from "@/lib/supabase/server";
import { parseOrNull, VisitPass } from "@/lib/jsonShapes";
import { reasonLabel, visitTime } from "@/lib/visitors";
import { CheckInCard, LiveStatus, SignOutButton } from "./VisitorPassParts";
import { brandTheme } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Visitor pass", robots: { index: false, follow: false } };

/**
 * A visitor's own page. Invited visitors open it from their invitation email and check in here
 * when they arrive; walk-in visitors land here after sending the reception form. It then shows
 * "please wait", "you're in" or "speak to reception" as reception decides. Only this visit is shown.
 */
export default async function VisitorPassPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Z2-9]{32}$/.test(token)) notFound();
  const admin = createAdminClient();
  if (!admin) notFound();
  const { data } = await admin.rpc("visit_pass", { p_token: token });
  if (!data) notFound(); // unknown or expired pass link
  const pass = parseOrNull(VisitPass, data, "v/pass");
  if (!pass) notFound();
  const loc = pass.location;
  const map = loc?.lat != null && loc?.lng != null ? `https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}#map=17/${loc.lat}/${loc.lng}` : null;
  const firstName = pass.name.split(" ")[0];
  const shownCode = `${pass.code.slice(0, 4)} ${pass.code.slice(4)}`;
  const theme = brandTheme(pass.brand);

  return (
    <main className="min-h-screen bg-paper px-4 py-7">
      <div className="mx-auto max-w-sm space-y-4">
        <div className="flex justify-center">{pass.brand?.logo_url ? <img src={pass.brand.logo_url} alt={`${pass.org} logo`} className="h-12 w-auto max-w-[180px] object-contain" /> : <Logo />}</div>

        {pass.status === "expected" && <>
          <section className="card space-y-3 text-center">
            <p className="eyebrow">Visitor pass · {pass.org}</p>
            <h1 className="text-2xl font-bold">{pass.name}</h1>
            <span className="chip bg-paper text-ink">Invited{pass.expected_at ? ` · ${visitTime(pass.expected_at, pass.timezone)}` : ""}</span>
            <div className="space-y-1.5 border-t border-line pt-3 text-left text-sm">
              {pass.host && <p><b>Host:</b> {pass.host}</p>}
              {loc && <p><b>Where:</b> {loc.name}{loc.address ? <span className="text-muted">, {loc.address}</span> : null}</p>}
              {pass.purpose && <p><b>Purpose:</b> {pass.purpose}</p>}
              {map && <p><a className="font-semibold underline" href={map} target="_blank" rel="noreferrer">Map and directions</a></p>}
            </div>
          </section>
          <CheckInCard token={token} code={pass.code} phone={pass.phone ?? ""} company={pass.company ?? ""}
            rules={pass.rules_text ?? ""} notice={pass.privacy_notice ?? ""} theme={{ primary: theme.primary, onPrimary: theme.onPrimary }} />
        </>}

        {pass.status === "waiting" && (
          <section className="card space-y-4 text-center">
            <div aria-hidden="true" className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-warn">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            </div>
            <h1 className="text-2xl font-bold">Thanks, {firstName}. Please wait at reception.</h1>
            <p className="text-sm text-muted">Reception has your details and will let you in shortly. This page updates by itself.</p>
            <div className="rounded-2xl border border-line bg-paper px-4 py-4">
              <p className="eyebrow">If reception asks, show this</p>
              <img src={`/api/visit-qr?t=${encodeURIComponent(token)}`} alt="Your visitor QR code" width={160} height={160} className="mx-auto my-2 rounded-xl border border-line bg-white" />
              <p className="font-mono text-3xl font-extrabold tracking-[0.18em]">{shownCode}</p>
              <p className="mt-1 text-sm text-muted">{[pass.walk_in ? reasonLabel(pass.reason) : "Invited", pass.host ? `visiting ${pass.host}` : pass.host_hint ? `to see ${pass.host_hint}` : null].filter(Boolean).join(" · ")}</p>
            </div>
            <LiveStatus token={token} status="waiting" />
          </section>
        )}

        {pass.status === "on_site" && (
          <section className="card space-y-4 text-center">
            <div aria-hidden="true" className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-ok">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            </div>
            <h1 className="text-2xl font-bold">You’re in. Welcome, {firstName}.</h1>
            <p className="text-sm text-muted">{pass.host ? `${pass.host} has been told you’re here.` : "Reception will show you the way."}</p>
            <div className="rounded-2xl border border-line bg-white p-4 text-left" style={{ borderLeft: `6px solid ${theme.accent}` }}>
              <p className="eyebrow">Visitor · {pass.org}</p>
              <p className="mt-1 text-xl font-bold">{pass.name}</p>
              <p className="text-sm text-muted">{[pass.company, pass.host ? `Visiting ${pass.host}` : null].filter(Boolean).join(" · ")}</p>
              <p className="text-sm text-muted">Signed in {visitTime(pass.signed_in_at, pass.timezone)}{loc ? ` · ${loc.name}` : ""}</p>
            </div>
            <SignOutButton token={token} />
          </section>
        )}

        {pass.status === "left" && (
          <section className="card space-y-2 text-center">
            <h1 className="text-xl font-bold">Visit finished</h1>
            <p className="text-sm text-muted">Thanks for visiting {pass.org}. You’ve been signed out.</p>
          </section>
        )}
        {pass.status === "denied" && (
          <section className="card space-y-2 text-center">
            <h1 className="text-xl font-bold">Please speak to reception</h1>
            <p className="text-sm text-muted">Reception will help you with your visit.</p>
          </section>
        )}
        {pass.status === "cancelled" && (
          <section className="card space-y-2 text-center">
            <h1 className="text-xl font-bold">This visit was cancelled</h1>
            <p className="text-sm text-muted">If you still need to visit, please contact {pass.host ?? pass.org}.</p>
          </section>
        )}

        <p className="text-center text-xs text-muted">Keep this link private. Your details are deleted automatically after {pass.retention_days ?? 90} days.</p>
      </div>
    </main>
  );
}
