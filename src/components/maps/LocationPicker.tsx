"use client";

import { useState } from "react";
import { MapView } from "./MapView";
import { searchPlaces, reverseGeocode, type Place } from "@/lib/geocode";
import { getBestPosition } from "@/lib/geo";
import { friendly } from "@/lib/errors";

/**
 * Pick a place on a map: search an address, use current GPS, or tap the map.
 * Writes hidden form fields: lat, lng, address and (optionally) radius_m.
 */
export function LocationPicker({ radiusEditable = true, defaultRadius = 200, initial }: {
  radiusEditable?: boolean;
  defaultRadius?: number;
  initial?: { lat: number; lng: number; address?: string | null };
}) {
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(initial ? { lat: initial.lat, lng: initial.lng } : null);
  const [address, setAddress] = useState(initial?.address ?? "");
  const [radius, setRadius] = useState(defaultRadius);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function place(lat: number, lng: number, knownAddress?: string) {
    setPin({ lat, lng });
    setResults([]);
    if (knownAddress) setAddress(knownAddress);
    else {
      setAddress("Finding address…");
      setAddress((await reverseGeocode(lat, lng)) ?? "");
    }
  }

  async function search(e?: React.FormEvent | React.KeyboardEvent) {
    e?.preventDefault();
    setBusy(true); setNote(null);
    try {
      const found = await searchPlaces(query);
      setResults(found);
      if (!found.length) setNote("No match. Try a street and area, e.g. “Adeola Odeku, Victoria Island”.");
    } catch (err) {
      setNote(friendly(err, "maps/search", "Search failed."));
    } finally { setBusy(false); }
  }

  async function locate() {
    setBusy(true); setNote(null);
    try {
      const fix = await getBestPosition(15000, 15);
      await place(fix.lat, fix.lng);
      setNote(`Pinned your current position (±${Math.round(fix.accuracy)} m). Tap the map to adjust.`);
    } catch (err) {
      setNote(friendly(err, "maps/locate", "Couldn’t get location."));
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Search an address or building"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void search(e); }}
          aria-label="Search an address"
        />
        <button type="button" className="btn-ghost shrink-0" onClick={() => void search()} disabled={busy || query.trim().length < 3}>Search</button>
      </div>
      {results.length > 0 && (
        <ul className="max-h-48 overflow-auto rounded-xl border border-line bg-white text-sm">
          {results.map((r) => (
            <li key={`${r.lat},${r.lng}`}>
              <button type="button" className="w-full px-3 py-2 text-left hover:bg-paper" onClick={() => void place(r.lat, r.lng, r.label.split(",").slice(0, 4).join(","))}>{r.label}</button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => void locate()} disabled={busy} className="btn-ghost w-full">
        {busy ? "Working…" : "📍 Use my current location"}
      </button>

      <MapView
        height={260}
        label="Pick the place on the map"
        onPick={(lat, lng) => void place(lat, lng)}
        markers={pin ? [{ lat: pin.lat, lng: pin.lng, tone: "brand" }] : []}
        circles={pin ? [{ lat: pin.lat, lng: pin.lng, radius, tone: "brand" }] : []}
      />
      <p className="text-xs text-muted">{note ?? "Search, use your location, or tap the map to drop the pin. The circle is the check-in area."}</p>

      <div>
        <label className="label" htmlFor="picker-address">Address</label>
        <input id="picker-address" name="address" className="input" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} placeholder="Filled in from the map" />
      </div>
      {radiusEditable ? (
        <div>
          <label className="label" htmlFor="picker-radius">Check-in radius: {radius} m</label>
          <input id="picker-radius" name="radius_m" type="range" min={50} max={1000} step={10} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="w-full accent-[#bd4528]" />
          <p className="mt-1 text-xs text-muted">150–250 m suits most buildings. Bigger for campuses or estates.</p>
        </div>
      ) : (
        <input type="hidden" name="radius_m" value={radius} />
      )}
      <input type="hidden" name="lat" value={pin ? pin.lat.toFixed(6) : ""} />
      <input type="hidden" name="lng" value={pin ? pin.lng.toFixed(6) : ""} />
      {pin && <p className="text-xs text-muted tabular-nums">Pinned at {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}</p>}
    </div>
  );
}
