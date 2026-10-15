import { MapView } from "@/components/maps/MapView";
import { mapsLink } from "@/lib/geo";

/** Map of the staff member's own approved (or requested) home pin, with the check-in circle. */
export function HomeMap({ lat, lng, label, radius, address, pending }: {
  lat: number; lng: number; label: string; radius: number; address?: string | null; pending?: boolean;
}) {
  return (
    <figure className="space-y-2">
      <MapView height={190} label={label} markers={[{ lat, lng, tone: pending ? "warn" : "ok" }]} circles={[{ lat, lng, radius, tone: pending ? "warn" : "ok" }]} />
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>{label}{address ? ` · ${address}` : ""}</span>
        <a className="underline" target="_blank" rel="noreferrer" href={mapsLink(lat, lng)}>Open in Google Maps</a>
      </figcaption>
    </figure>
  );
}
