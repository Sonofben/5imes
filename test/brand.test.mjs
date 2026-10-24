// Brand colours stay readable whatever a company picks (src/lib/brand.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { brandTheme, contrast, textOn, darkenUntil, paletteFromPixels } from "../src/lib/brand.ts";

test("text on the main colour is always readable", () => {
  for (const c of ["#0E4D3C", "#F2B134", "#ffffff", "#ffff00", "#7f7f7f", "#000000", "#e65b35"]) {
    const t = brandTheme({ primary: c });
    assert.ok(contrast(t.primary, t.onPrimary) >= 4.5, `${c} → ${t.primary}/${t.onPrimary}`);
  }
});

test("dark colours get white text, light colours get dark text", () => {
  assert.equal(textOn("#0E4D3C"), "#ffffff");
  assert.equal(textOn("#F2B134"), "#182126");
});

test("accent links are darkened until readable on white", () => {
  const t = brandTheme({ primary: "#0E4D3C", accent: "#F2B134" });
  assert.equal(t.accent, "#F2B134");
  assert.ok(contrast(t.accentText, "#ffffff") >= 4.5);
  assert.ok(contrast(darkenUntil("#ffff00", "#ffffff"), "#ffffff") >= 4.5);
});

test("without company colours, 5imes' own look is used", () => {
  const t = brandTheme(null);
  assert.equal(t.branded, false);
  assert.equal(t.primary, "#182126");
  assert.equal(brandTheme({ primary: "not-a-colour" }).branded, false);
});

test("logo colours: distinct, ignoring white background and transparency", () => {
  const px = [];
  const put = (r, g, b, a, n) => { for (let i = 0; i < n; i++) px.push(r, g, b, a, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0); };
  put(255, 255, 255, 255, 50); put(14, 77, 60, 255, 30); put(15, 78, 61, 255, 5); put(242, 177, 52, 255, 20); put(0, 0, 0, 0, 40);
  const p = paletteFromPixels(new Uint8ClampedArray(px));
  assert.equal(p.length, 2);
  assert.ok(p[0].startsWith("#0e4d") || p[0].startsWith("#0e4e"), p[0]);
});
