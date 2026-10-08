import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "5ime — check in",
    short_name: "5ime",
    description: "Work from anywhere, 5 days, on time.",
    start_url: "/app",
    display: "standalone",
    background_color: "#f6f4ee",
    theme_color: "#12141a",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
