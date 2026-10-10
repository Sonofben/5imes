import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "5ime — scheduled attendance",
    short_name: "5ime",
    description: "Check in at an approved office or approved home on scheduled days.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#f4f3ef",
    theme_color: "#12141a",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
