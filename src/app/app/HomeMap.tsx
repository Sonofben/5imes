/** Small map of the staff member's own approved (or requested) home pin. OpenStreetMap, no API key. */
export function HomeMap({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const d = 0.004; // ≈ 400 m around the pin
  const bbox = [lng - d, lat - d * 0.75, lng + d, lat + d * 0.75].map((n) => n.toFixed(5)).join(",");
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(6)},${lng.toFixed(6)}`;
  return (
    <figure className="overflow-hidden rounded-xl border border-line">
      <iframe title={label} src={src} className="block h-44 w-full" loading="lazy" referrerPolicy="no-referrer" />
      <figcaption className="flex items-center justify-between bg-paper px-3 py-2 text-xs text-muted">
        <span>{label}</span>
        <a className="underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`}>Open larger map</a>
      </figcaption>
    </figure>
  );
}
