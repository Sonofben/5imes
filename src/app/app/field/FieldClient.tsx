"use client";

import { useRef, useState } from "react";
import { getBestPosition, type Fix } from "@/lib/geo";
import { OUTCOMES } from "@/lib/fieldLabels";
import { startVisit, endVisit } from "./actions";

type Site = { id: string; name: string; address: string | null; lat: number; lng: number; radius_m: number };

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}
const fmtM = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

/** Find client sites near you and check in at one. Your location is only read when you press the button. */
export function NearbySites({ sites, planned }: { sites: Site[]; planned: string[] }) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function locate() {
    setBusy(true); setError(null);
    try { setFix(await getBestPosition(12000, 30)); } catch (e) { setError(e instanceof Error ? e.message : "Couldn’t get your location."); }
    finally { setBusy(false); }
  }
  const list = fix ? [...sites].map((s) => ({ ...s, d: metres(fix, s) })).sort((a, b) => a.d - b.d).slice(0, 12) : sites.filter((s) => planned.includes(s.id)).map((s) => ({ ...s, d: null as number | null }));
  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">Check in at a client site</h2>
        <button type="button" onClick={locate} disabled={busy} className="btn-primary">{busy ? "Finding you…" : fix ? "Refresh" : "Find sites near me"}</button></div>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      {!fix && <p className="text-sm text-muted">5ime reads your location only when you press the button, to check you are at the site. It is not kept.</p>}
      {list.length > 0 && <ul className="divide-y divide-line">{list.map((s) => {
        const here = s.d !== null && fix && s.d <= s.radius_m + Math.min(fix.accuracy, 50);
        return <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <div className="min-w-0"><p className="font-semibold">{s.name}{planned.includes(s.id) && <span className="chip ml-2 bg-[#eef2f7] text-[#1f4e79]">Planned today</span>}</p>
            <p className="truncate text-xs text-muted">{s.address ?? ""}{s.d !== null ? ` · ${fmtM(s.d)} away` : ""}</p></div>
          {fix && <form action={startVisit}>
            <input type="hidden" name="site" value={s.id} /><input type="hidden" name="lat" value={fix.lat} /><input type="hidden" name="lng" value={fix.lng} /><input type="hidden" name="acc" value={fix.accuracy} />
            <button className={here ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>{here ? "Check in" : "Check in anyway"}</button>
          </form>}
        </li>; })}</ul>}
      {fix && fix.accuracy > 150 && <p className="text-xs text-warn">Your location is rough (±{Math.round(fix.accuracy)} m). Step outside for a better signal.</p>}
    </section>
  );
}

/** Finish the open visit: note, outcome, optional photo; location is read once when you press Check out. */
export function EndVisitForm({ visitId }: { visitId: string }) {
  const form = useRef<HTMLFormElement>(null);
  const photo = useRef<HTMLInputElement>(null);
  const ready = useRef(false);
  const [busy, setBusy] = useState(false);

  function shrink(f: File | undefined) {
    if (!f) return;
    const src = URL.createObjectURL(f), img = new Image();
    img.onload = () => {
      const s = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(src);
      c.toBlob((b) => { if (b && photo.current) { const dt = new DataTransfer(); dt.items.add(new File([b], "visit.jpg", { type: "image/jpeg" })); photo.current.files = dt.files; } }, "image/jpeg", 0.82);
    };
    img.src = src;
  }

  // First press: read the location once and put it in the form, then send the form.
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    if (ready.current) return;
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const f = form.current!;
    try {
      const fix = await getBestPosition(8000, 50);
      (f.elements.namedItem("lat") as HTMLInputElement).value = String(fix.lat);
      (f.elements.namedItem("lng") as HTMLInputElement).value = String(fix.lng);
      (f.elements.namedItem("acc") as HTMLInputElement).value = String(fix.accuracy);
    } catch { /* no location: the visit is saved and flagged */ }
    ready.current = true;
    f.requestSubmit();
  }

  return (
    <form ref={form} action={endVisit.bind(null, visitId)} onSubmit={submit} className="space-y-3">
      <input type="hidden" name="lat" defaultValue="" /><input type="hidden" name="lng" defaultValue="" /><input type="hidden" name="acc" defaultValue="" />
      <div><label className="label" htmlFor="v-outcome">How did it go?</label><select id="v-outcome" name="outcome" className="input" defaultValue="completed">{Object.entries(OUTCOMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div><label className="label" htmlFor="v-note">Notes</label><textarea id="v-note" name="note" rows={3} maxLength={2000} className="input" placeholder="What happened, who you met, what’s next" /></div>
      <div><label className="label" htmlFor="v-photo">Photo (optional, proof of visit)</label><input ref={photo} id="v-photo" name="photo" type="file" accept="image/*" capture="environment" className="input py-2" onChange={(e) => shrink(e.target.files?.[0])} /></div>
      <button disabled={busy} className="btn-primary w-full">{busy ? "Saving…" : "Check out"}</button>
    </form>
  );
}
