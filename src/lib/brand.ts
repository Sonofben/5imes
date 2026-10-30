/**
 * Company brand colours, made safe to use. A company picks a main colour and an accent; the text
 * colour on top of them is worked out here so it is always readable (WCAG contrast 4.5:1).
 * Used on the server (pages, emails) and in the browser (the brand kit preview).
 */
export const INK = "#182126";
export const WHITE = "#ffffff";
const HEX = /^#[0-9a-fA-F]{6}$/;

export type Brand = { logo_url?: string | null; primary?: string | null; accent?: string | null };
export type BrandTheme = { primary: string; onPrimary: string; accent: string; accentText: string; branded: boolean };

export function isHex(v: unknown): v is string {
  return typeof v === "string" && HEX.test(v);
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex([r, g, b]: [number, number, number]) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}
export function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** White or dark text, whichever reads better on this background. */
export function textOn(bg: string) {
  return contrast(bg, WHITE) >= contrast(bg, INK) ? WHITE : INK;
}
/** Darken a colour step by step until it reaches the contrast needed against `against`. */
export function darkenUntil(hex: string, against: string, min = 4.5) {
  let c = rgb(hex);
  for (let i = 0; i < 20 && contrast(toHex(c), against) < min; i++) c = c.map((v) => v * 0.88) as [number, number, number];
  return toHex(c);
}

/**
 * The colours to paint with. Without company colours (or on a plan without them) this is 5imes'
 * own look. The main colour keeps its hue; if neither white nor dark text reads well on it, it is
 * darkened a little. The accent is used as-is for stripes and borders, and darkened for text links.
 */
export function brandTheme(brand?: Brand | null): BrandTheme {
  const primaryIn = isHex(brand?.primary) ? brand!.primary! : null;
  const accentIn = isHex(brand?.accent) ? brand!.accent! : null;
  let primary = primaryIn ?? INK;
  if (contrast(primary, textOn(primary)) < 4.5) primary = darkenUntil(primary, WHITE);
  const accent = accentIn ?? (primaryIn ? primary : "#e65b35");
  return { primary, onPrimary: textOn(primary), accent, accentText: darkenUntil(accent, WHITE), branded: !!primaryIn };
}

/** Pick up to `count` distinct, characterful colours from image pixels (RGBA bytes). Browser only. */
export function paletteFromPixels(data: Uint8ClampedArray, count = 5): string[] {
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 16) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 200) continue;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max > 240 && min > 240) continue; // background white
    const key = `${r >> 5},${g >> 5},${b >> 5}`;
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b; buckets.set(key, e);
  }
  const ranked = [...buckets.values()].sort((x, y) => y.n - x.n).map((e) => toHex([e.r / e.n, e.g / e.n, e.b / e.n]));
  const out: string[] = [];
  for (const c of ranked) {
    if (out.every((o) => colourDistance(o, c) > 60)) out.push(c);
    if (out.length === count) break;
  }
  return out;
}
function colourDistance(a: string, b: string) {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/** How colourful a colour is (0 = grey, 1 = fully saturated). */
export function saturation(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const l = (max + min) / 2;
  return (max - min) / (l > 0.5 ? 2 - max - min : max + min);
}

/**
 * Give the logo's colours their jobs. The palette comes most-used first. The main colour is the
 * most-used colour that has real colour in it (not grey, not near-white); if the logo is all
 * greys or black, that colour is used as it is. The accent is the next colour that looks clearly
 * different. Returns nulls when the logo had nothing usable.
 */
export function pickBrandColours(palette: string[]): { main: string | null; accent: string | null } {
  const usable = palette.filter((c) => isHex(c) && luminance(c) < 0.85);
  const colourful = usable.filter((c) => saturation(c) >= 0.25);
  const main = colourful[0] ?? usable[0] ?? null;
  if (!main) return { main: null, accent: null };
  const rest = (colourful.length > 1 ? colourful : usable).filter((c) => c !== main);
  const accent = rest.find((c) => colourDistance(c, main) > 90) ?? null;
  return { main, accent };
}
