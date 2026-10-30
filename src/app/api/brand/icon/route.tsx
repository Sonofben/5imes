import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { isOwnLogoUrl, loadPublicBrand } from "@/lib/publicBrand";

const SIZES = new Set([32, 64, 180, 192, 512]);

/**
 * The app icon for a company on Pro or Premium: its logo on a white tile, on its main colour.
 * `m=1` gives the "maskable" version (more padding, for Android's round and squircle icons).
 * Basic companies, unknown links and anything unexpected fall back to 5ime's own icon.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const size = Number(url.searchParams.get("s") ?? 192);
  const maskable = url.searchParams.get("m") === "1";
  const fallback = NextResponse.redirect(new URL(size >= 180 ? "/icon-512.png" : "/icon-192.png", url), 302);
  if (!SIZES.has(size)) return fallback;
  const brand = await loadPublicBrand(url.searchParams.get("o") ?? "");
  if (!brand || !brand.full) return fallback;

  // Fetch the logo ourselves (our storage only, short timeout, PNG/JPEG only) and inline it.
  let logo: string | null = null;
  if (isOwnLogoUrl(brand.logoUrl)) {
    try {
      const res = await fetch(brand.logoUrl, { signal: AbortSignal.timeout(4000) });
      const type = res.headers.get("content-type") ?? "";
      const bytes = res.ok ? await res.arrayBuffer() : null;
      if (bytes && bytes.byteLength <= 1024 * 1024 && /^image\/(png|jpeg)$/.test(type)) {
        logo = `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
      }
    } catch { /* fall back to initials */ }
  }
  const initials = brand.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  const tile = Math.round(size * (maskable ? 0.58 : 0.74));
  const img = new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: brand.theme.primary, borderBottom: maskable ? "none" : `${Math.max(2, Math.round(size / 24))}px solid ${brand.theme.accent}` }}>
        <div style={{ width: tile, height: tile, borderRadius: Math.round(tile * 0.22), background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {logo
            ? <img src={logo} alt="" style={{ maxWidth: tile * 0.82, maxHeight: tile * 0.82, objectFit: "contain" }} />
            : <span style={{ fontSize: Math.round(tile * 0.42), fontWeight: 800, color: brand.theme.primary }}>{initials || "5"}</span>}
        </div>
      </div>
    ),
    { width: size, height: size },
  );
  img.headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  return img;
}
