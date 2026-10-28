import { UserError } from "./errors.ts";
export type Fix = { lat: number; lng: number; accuracy: number };

/**
 * Watches GPS for up to `ms` and returns the most accurate reading.
 * Stops early once accuracy is good enough.
 */
export function getBestPosition(ms = 10000, goodEnough = 25): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new UserError("This browser can’t share location. Try Chrome or Safari on your phone."));
      return;
    }
    let best: Fix | null = null;
    const finish = () => {
      navigator.geolocation.clearWatch(id);
      clearTimeout(timer);
      if (best) resolve(best);
      else reject(new UserError("Couldn’t get your location. Turn on location/GPS and try again."));
    };
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const fix = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
        if (!best || fix.accuracy < best.accuracy) best = fix;
        if (fix.accuracy <= goodEnough) finish();
      },
      (err) => {
        navigator.geolocation.clearWatch(id);
        clearTimeout(timer);
        if (err.code === err.PERMISSION_DENIED) {
          reject(new UserError("Location permission is blocked. Allow location for this site in your browser settings."));
        } else if (best) resolve(best);
        else reject(new UserError("Couldn’t get your location. Turn on location/GPS and try again."));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: ms }
    );
    const timer = setTimeout(finish, ms);
  });
}

export function mapsLink(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/** "±35 m" or "±20 km" — readable accuracy. */
export function accuracyLabel(m: number) {
  return m >= 1000 ? `±${Math.round(m / 1000)} km` : `±${Math.round(m)} m`;
}

/** Readings worse than this are too rough to pin a home or trust a check-in. */
export const ROUGH_ACCURACY_M = 100;

/** What to tell someone whose reading is too rough — usually a laptop or desktop with no GPS. */
export function roughLocationMessage(m: number) {
  return `Your location is only accurate to ${accuracyLabel(m)}. This usually happens on a laptop or desktop, which has no GPS. Use 5ime on your phone with location turned on, ideally near a window.`;
}
