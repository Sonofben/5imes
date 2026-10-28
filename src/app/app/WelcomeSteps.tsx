"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getBestPosition, accuracyLabel, roughLocationMessage, ROUGH_ACCURACY_M } from "@/lib/geo";
import { reverseGeocode } from "@/lib/geocode";
import { friendly, UserError } from "@/lib/errors";

/** First-time welcome for staff: allow location → pin home (if they have home days) → add to home screen. */
export function WelcomeSteps({ companyName, logoUrl, hasHomeDays, homeDone }: { companyName: string; logoUrl: string | null; hasHomeDays: boolean; homeDone: boolean }) {
  const router = useRouter();
  const steps = ["location", ...(hasHomeDays && !homeDone ? ["home"] : []), "install"] as const;
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const current = steps[step];

  async function next() {
    setNote(null);
    if (step < steps.length - 1) { setStep(step + 1); return; }
    setBusy(true);
    await createClient().rpc("mark_onboarded");
    router.refresh();
  }

  async function allowLocation() {
    setBusy(true); setNote(null);
    try {
      const fix = await getBestPosition(10000, 50);
      setNote(fix.accuracy > ROUGH_ACCURACY_M
        ? { ok: false, text: roughLocationMessage(fix.accuracy) }
        : { ok: true, text: `Location works (${accuracyLabel(fix.accuracy)}).` });
    } catch (e) { setNote({ ok: false, text: friendly(e, "app/welcome", "Could not get location.") }); }
    finally { setBusy(false); }
  }

  async function pinHome() {
    setBusy(true); setNote(null);
    try {
      const fix = await getBestPosition(15000, 20);
      if (fix.accuracy > ROUGH_ACCURACY_M) throw new UserError(roughLocationMessage(fix.accuracy));
      const address = await reverseGeocode(fix.lat, fix.lng);
      const { error } = await createClient().rpc("request_home_location", { p_lat: fix.lat, p_lng: fix.lng, p_accuracy: fix.accuracy, p_address: address ?? "" });
      if (error) throw new UserError(friendly(error, "app/welcome"));
      setNote({ ok: true, text: "Home location sent to your admin for approval." });
    } catch (e) { setNote({ ok: false, text: friendly(e, "app/welcome", "Could not pin your home.") }); }
    finally { setBusy(false); }
  }

  return (
    <section className="card mb-4 space-y-4 border-brand/30">
      <div className="flex items-center gap-3">
        {logoUrl && <img src={logoUrl} alt="" className="h-10 w-auto max-w-[120px] object-contain" />}
        <div><p className="eyebrow">Welcome to {companyName}</p><h2 className="text-lg font-bold">Let&apos;s get you set up · step {step + 1} of {steps.length}</h2></div>
      </div>
      {current === "location" && <div className="space-y-3"><p className="text-sm text-muted">5ime checks you&apos;re at your office or approved home when you check in. Allow location when your phone asks.</p><button onClick={allowLocation} disabled={busy} className="btn-primary w-full">{busy ? "Checking…" : "Allow location"}</button></div>}
      {current === "home" && <div className="space-y-3"><p className="text-sm text-muted">You have home working days. If you are at home right now, pin it — your admin approves it once. Not at home? Skip and do it later from this page.</p><button onClick={pinHome} disabled={busy} className="btn-primary w-full">{busy ? "Getting your location…" : "I’m at home — pin it"}</button></div>}
      {current === "install" && <div className="space-y-2 text-sm text-muted"><p>Add 5ime to your home screen so it opens like an app:</p><ul className="list-disc space-y-1 pl-5"><li><b>Android (Chrome):</b> menu ⋮ → <i>Add to Home screen</i></li><li><b>iPhone (Safari):</b> Share ↑ → <i>Add to Home Screen</i></li></ul></div>}
      {note && <p className={`text-sm ${note.ok ? "text-ok" : "text-bad"}`}>{note.text}</p>}
      <div className="flex justify-between gap-2">
        <button onClick={() => { setNote(null); setStep(Math.max(0, step - 1)); }} disabled={step === 0 || busy} className="btn-ghost btn-sm">Back</button>
        <button onClick={next} disabled={busy} className="btn-ghost btn-sm">{step < steps.length - 1 ? (current === "home" ? "Skip / next" : "Next") : "Finish"}</button>
      </div>
    </section>
  );
}
