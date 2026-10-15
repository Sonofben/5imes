"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";

export type MapTone = "brand" | "ok" | "warn" | "ink" | "bad";
export type MapMarker = { lat: number; lng: number; label?: string; tone?: MapTone };
export type MapCircle = { lat: number; lng: number; radius: number; tone?: MapTone; label?: string };

const TONES: Record<MapTone, string> = { brand: "#e65b35", ok: "#18794e", warn: "#9a5b05", ink: "#182126", bad: "#b42318" };

/**
 * OpenStreetMap map (Leaflet, no API key). Draws pins and radius circles and
 * fits them in view. Pass `onPick` to let the user click the map to place a pin.
 */
export function MapView({
  markers = [],
  circles = [],
  height = 220,
  onPick,
  className = "",
  label = "Map",
}: {
  markers?: MapMarker[];
  circles?: MapCircle[];
  height?: number;
  onPick?: (lat: number, lng: number) => void;
  className?: string;
  label?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const key = JSON.stringify({ markers, circles });

  // create once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leaflet = await import("leaflet");
      if (cancelled || !el.current || map.current) return;
      L.current = leaflet;
      const m = leaflet.map(el.current, { scrollWheelZoom: false, attributionControl: true }).setView([6.5244, 3.3792], 11);
      leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(m);
      m.on("click", (e: Leaflet.LeafletMouseEvent) => pick.current?.(e.latlng.lat, e.latlng.lng));
      layer.current = leaflet.layerGroup().addTo(m);
      map.current = m;
      draw();
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // redraw when data changes
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function draw() {
    const leaflet = L.current, m = map.current, g = layer.current;
    if (!leaflet || !m || !g) return;
    g.clearLayers();
    const points: Leaflet.LatLngExpression[] = [];
    for (const c of circles) {
      const color = TONES[c.tone ?? "ink"];
      const circle = leaflet.circle([c.lat, c.lng], { radius: c.radius, color, weight: 1.5, fillColor: color, fillOpacity: 0.08 }).addTo(g);
      if (c.label) circle.bindTooltip(c.label);
      points.push(...[circle.getBounds().getNorthWest(), circle.getBounds().getSouthEast()]);
    }
    for (const p of markers) {
      const color = TONES[p.tone ?? "brand"];
      const dot = leaflet.circleMarker([p.lat, p.lng], { radius: 8, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1 }).addTo(g);
      if (p.label) dot.bindTooltip(p.label, { permanent: markers.length <= 6, direction: "top", offset: [0, -8] });
      points.push([p.lat, p.lng]);
    }
    if (points.length === 1) m.setView(points[0], 16);
    else if (points.length > 1) m.fitBounds(leaflet.latLngBounds(points), { padding: [28, 28], maxZoom: 17 });
  }

  return (
    <div
      ref={el}
      role="img"
      aria-label={label}
      className={`z-0 w-full overflow-hidden rounded-xl border border-line bg-paper ${onPick ? "cursor-crosshair" : ""} ${className}`}
      style={{ height }}
    />
  );
}
