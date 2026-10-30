"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * A short slide tour that explains what Pro adds. Opens when a Basic company reaches its staff
 * limit (or taps a locked feature). Next / Back / Skip; the last slide has the upgrade button.
 * The pictures are drawn in markup with a sample company's colours, so no images are loaded.
 */
type Reason = "staff" | "branding" | "visitors";

const HEADLINES: Record<Reason, { title: string; text: string }> = {
  staff: { title: "Upgrade to Pro to add more staff", text: "Basic includes up to 15 staff. Pro has no limit — and a lot more for a growing company." },
  branding: { title: "Make 5ime look like your company", text: "Your logo is already in the app. Pro adds your colours everywhere your staff look." },
  visitors: { title: "Welcome visitors with 5ime", text: "Pro adds visitor management for your reception." },
};

export function UpgradeTour({ reason = "staff", openAtStart = false, label = "See what Pro adds", isAdmin = true }: {
  reason?: Reason; openAtStart?: boolean; label?: string; isAdmin?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);
  const head = HEADLINES[reason];
  const slides = [
    { title: head.title, text: head.text, art: <StaffArt /> },
    { title: "Your brand, everywhere", text: "5ime reads the colours in your logo and uses them on the sign-in page, the staff app, the phone icon, the browser tab and every email. 5ime only shows as “Powered by 5ime”.", art: <BrandArt /> },
    { title: "Every office and team", text: "Unlimited offices and branches, a check-in area per office, schedules per person or team, and managers who see their own team.", art: <OfficesArt /> },
    { title: "Visitors at reception", text: "Invite visitors with an “I’ve arrived” link, let walk-ins sign in from a QR poster, and admit them from one desk screen. Up to 100 visits a month at one office.", art: <VisitorsArt /> },
    { title: "Reports without limits", text: "Unlimited history, full attendance reports, weak-GPS flags and device records — and support on WhatsApp.", art: <ReportsArt /> },
  ];
  const last = step === slides.length - 1;

  function open() { setStep(0); ref.current?.showModal(); }
  function close() { ref.current?.close(); }
  useEffect(() => { if (openAtStart) ref.current?.showModal(); }, [openAtStart]);

  const s = slides[step];
  return (
    <>
      <button type="button" onClick={open} className="btn-primary">{label}</button>
      <dialog ref={ref} aria-labelledby="tour-title" className="w-[min(92vw,520px)] rounded-2xl p-0 backdrop:bg-ink/50">
        <div className="space-y-5 p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <span className="chip bg-[#fbf4e3] text-[#7a5a0e]">Pro plan</span>
            <button type="button" onClick={close} className="text-sm font-semibold text-muted underline">Skip</button>
          </div>
          <div aria-hidden="true" className="flex h-44 items-center justify-center overflow-hidden rounded-xl bg-paper">{s.art}</div>
          <div>
            <h2 id="tour-title" className="text-xl font-bold">{s.title}</h2>
            <p className="mt-1 text-sm leading-6 text-muted">{s.text}</p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-1.5" aria-label={`Slide ${step + 1} of ${slides.length}`}>
              {slides.map((_, i) => <span key={i} className={`h-2 rounded-full ${i === step ? "w-5 bg-ink" : "w-2 bg-line"}`} />)}
            </div>
            <div className="flex gap-2">
              {step > 0 && <button type="button" onClick={() => setStep(step - 1)} className="btn-ghost">Back</button>}
              {!last && <button type="button" onClick={() => setStep(step + 1)} className="btn-primary">Next</button>}
              {last && (isAdmin
                ? <Link href="/admin/billing?plan=pro" className="btn-primary">Upgrade to Pro</Link>
                : <button type="button" onClick={close} className="btn-primary">Ask your admin</button>)}
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}

// ── Small drawings (sample company: blue #1E4E9C and gold #D9A62E)
const BLUE = "#1E4E9C", GOLD = "#D9A62E";

function StaffArt() {
  return (
    <div className="flex items-end gap-2">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <div className="h-7 w-7 rounded-full" style={{ background: i < 5 ? "#c9cfd6" : BLUE }} />
          <div className="h-9 w-10 rounded-t-xl" style={{ background: i < 5 ? "#dfe3e8" : BLUE }} />
        </div>
      ))}
      <div className="ml-2 rounded-full px-3 py-1 text-sm font-extrabold" style={{ background: GOLD, color: "#182126" }}>15 → ∞</div>
    </div>
  );
}

function BrandArt() {
  return (
    <div className="flex items-center gap-4">
      <div className="w-28 overflow-hidden rounded-xl border border-line bg-white">
        <div className="px-2 py-2 text-[10px] font-bold text-white" style={{ background: BLUE, borderBottom: `3px solid ${GOLD}` }}>Your company</div>
        <div className="space-y-1.5 p-2"><div className="h-6 rounded-md" style={{ background: BLUE }} /><div className="h-2 w-3/4 rounded bg-line" /><div className="h-2 w-1/2 rounded bg-line" /></div>
      </div>
      <div className="flex flex-col items-center gap-1">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: BLUE, boxShadow: `0 0 0 3px ${GOLD}` }}><div className="h-6 w-6 rounded-full bg-white" /></div>
        <span className="text-[10px] font-bold">Your app</span>
      </div>
    </div>
  );
}

function OfficesArt() {
  return (
    <div className="flex items-end gap-3">
      {[56, 80, 64].map((h, i) => (
        <div key={i} className="flex w-14 flex-col items-center gap-1">
          <div className="w-full rounded-t-lg" style={{ height: h, background: i === 1 ? BLUE : "#c9cfd6" }} />
          <span className="text-[10px] font-semibold text-muted">{["Lekki", "Ikeja", "Abuja"][i]}</span>
        </div>
      ))}
    </div>
  );
}

function VisitorsArt() {
  return (
    <div className="flex items-center gap-4">
      <div className="grid h-20 w-20 grid-cols-4 gap-0.5 rounded-lg bg-white p-2">{Array.from({ length: 16 }, (_, i) => <span key={i} className={(i * 7) % 3 ? "bg-ink" : "bg-white"} />)}</div>
      <div className="w-36 space-y-1.5 rounded-xl border border-line bg-white p-2.5">
        <div className="text-[11px] font-bold">Amaka Eze · waiting</div>
        <div className="rounded-md py-1 text-center text-[10px] font-bold text-white" style={{ background: BLUE }}>Admit</div>
      </div>
    </div>
  );
}

function ReportsArt() {
  return (
    <div className="flex h-24 items-end gap-2">
      {[40, 64, 52, 80, 70, 92].map((h, i) => <div key={i} className="w-6 rounded-t-md" style={{ height: h, background: i % 2 ? GOLD : BLUE }} />)}
    </div>
  );
}
