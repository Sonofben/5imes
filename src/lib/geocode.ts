import { UserError } from "./errors.ts";
/**
 * Address search and street addresses from OpenStreetMap (Nominatim).
 * Free, no key; fair-use limit is about one request per second, which is fine
 * for occasional lookups when someone pins a place. Swap the base URL for a
 * hosted Nominatim (e.g. LocationIQ) if usage grows.
 */
const BASE = "https://nominatim.openstreetmap.org";

export type Place = { label: string; lat: number; lng: number };

export async function searchPlaces(query: string, countryCodes = "ng"): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const url = `${BASE}/search?format=jsonv2&limit=6&addressdetails=0&accept-language=en&countrycodes=${countryCodes}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new UserError("Address search is busy. Try again in a moment.");
  const rows = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  return rows.map((r) => ({ label: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }));
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `${BASE}/reverse?format=jsonv2&zoom=18&accept-language=en&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const row = (await res.json()) as { display_name?: string };
    return row.display_name ? shortAddress(row.display_name) : null;
  } catch {
    return null;
  }
}

/** "12, Adeola Odeku Street, Victoria Island, Eti-Osa, Lagos State, 101241, Nigeria" → first 4 parts. */
export function shortAddress(full: string) {
  return full.split(",").map((s) => s.trim()).filter(Boolean).filter((part) => part !== "Nigeria").slice(0, 4).join(", ");
}
