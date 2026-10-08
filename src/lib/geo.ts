export type Fix = { lat: number; lng: number; accuracy: number };

/**
 * Watches GPS for up to `ms` and returns the most accurate reading.
 * Stops early once accuracy is good enough.
 */
export function getBestPosition(ms = 10000, goodEnough = 25): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("This browser can’t share location. Try Chrome or Safari on your phone."));
      return;
    }
    let best: Fix | null = null;
    const finish = () => {
      navigator.geolocation.clearWatch(id);
      clearTimeout(timer);
      if (best) resolve(best);
      else reject(new Error("Couldn’t get your location. Turn on location/GPS and try again."));
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
          reject(new Error("Location permission is blocked. Allow location for this site in your browser settings."));
        } else if (best) resolve(best);
        else reject(new Error("Couldn’t get your location. Turn on location/GPS and try again."));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: ms }
    );
    const timer = setTimeout(finish, ms);
  });
}

export function mapsLink(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
