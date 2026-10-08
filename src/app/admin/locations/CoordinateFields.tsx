"use client";

import { useState } from "react";
import { getBestPosition } from "@/lib/geo";

/** Lat/lng inputs with a "use my current location" button. Accepts pasted "lat, lng" too. */
export function CoordinateFields() {
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function locate() {
    setBusy(true);
    setNote(null);
    try {
      const fix = await getBestPosition(15000, 15);
      setLat(fix.lat.toFixed(6));
      setLng(fix.lng.toFixed(6));
      setNote(`Got it (±${Math.round(fix.accuracy)}m).`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn’t get location");
    } finally {
      setBusy(false);
    }
  }

  function onLatChange(v: string) {
    const parts = v.split(",").map((s) => s.trim());
    if (parts.length === 2 && parts.every((p) => p && !isNaN(Number(p)))) {
      setLat(parts[0]);
      setLng(parts[1]);
    } else setLat(v);
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={locate} disabled={busy} className="btn-ghost w-full">
        {busy ? "Getting location…" : "📍 Use my current location (stand inside the office)"}
      </button>
      <div className="grid grid-cols-2 gap-2">
        <input name="lat" className="input" placeholder="Latitude e.g. 6.6018" value={lat} onChange={(e) => onLatChange(e.target.value)} required />
        <input name="lng" className="input" placeholder="Longitude e.g. 3.3515" value={lng} onChange={(e) => setLng(e.target.value)} required />
      </div>
      <p className="text-xs text-muted">
        {note ?? "Or in Google Maps: long-press the building, copy the numbers and paste them into Latitude."}
      </p>
    </div>
  );
}
