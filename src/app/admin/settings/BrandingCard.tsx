"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { brandTheme, contrast, isHex, paletteFromPixels, pickBrandColours } from "@/lib/brand";
import { UpgradeTour } from "@/components/UpgradeTour";
import { saveBranding } from "./actions";

/** Read the colours out of an image the admin chose (or the current logo). */
function colours(src: string, onDone: (p: string[]) => void) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const size = 96, c = document.createElement("canvas");
      const scale = Math.min(1, size / Math.max(img.width, img.height));
      c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      onDone(paletteFromPixels(ctx.getImageData(0, 0, c.width, c.height).data));
    } catch { onDone([]); }
  };
  img.onerror = () => onDone([]);
  img.src = src;
}

/**
 * Turn any chosen logo (PNG, JPG, WebP or SVG) into a PNG of at most 512 px before upload.
 * An SVG is drawn as a picture, so anything hidden in it (scripts, links) is dropped, and the
 * server only ever receives a plain PNG.
 */
function toPng(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 512, h = img.naturalHeight || 512;
      const scale = Math.min(1, 512 / Math.max(w, h));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
      const ctx = c.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error("canvas")); return; }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(new File([b], "logo.png", { type: "image/png" })) : reject(new Error("png"))), "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image")); };
    img.src = url;
  });
}

/**
 * Brand kit: company link, logo, and the two colours used on the staff sign-in page, the staff app,
 * visitors' phone pages, the reception poster and tablet, and invitation emails. Readable text is
 * chosen automatically. Colours are part of Pro and Premium (the database enforces this too).
 */
export function BrandingCard({ slug, logoUrl, brandColor, accentColor, siteUrl, colorsAllowed }: {
  slug: string; logoUrl: string | null; brandColor: string | null; accentColor: string | null; siteUrl: string; colorsAllowed: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(logoUrl);
  const [palette, setPalette] = useState<string[]>([]);
  const [main, setMain] = useState(brandColor ?? "");
  const [accent, setAccent] = useState(accentColor ?? "");
  const [autoPicked, setAutoPicked] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function chooseLogo(f: File | undefined) {
    setFileError(null);
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setFileError("That file is too big. Choose a logo under 5 MB."); return; }
    try {
      const png = await toPng(f);
      if (png.size > 1024 * 1024) { setFileError("That logo is too detailed to use. Try a simpler PNG or SVG."); return; }
      const dt = new DataTransfer(); dt.items.add(png);
      if (fileRef.current) fileRef.current.files = dt.files;
      const url = URL.createObjectURL(png);
      setPreview(url);
      colours(url, (p) => {
        setPalette(p);
        if (!colorsAllowed) return;
        const picked = pickBrandColours(p);
        if (picked.main) { setMain(picked.main); setAccent(picked.accent ?? ""); setAutoPicked(true); }
      });
    } catch {
      setFileError("We couldn’t read that file. Upload a PNG, JPG, WebP or SVG logo.");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // Colours of the logo already saved (a newly chosen logo is read in chooseLogo).
  useEffect(() => { if (logoUrl) colours(logoUrl, setPalette); }, [logoUrl]);
  const theme = useMemo(() => brandTheme({ primary: main || null, accent: accent || null }), [main, accent]);
  const ratio = contrast(theme.primary, theme.onPrimary);
  const choices = [...new Set([...palette, ...(isHex(brandColor) ? [brandColor] : []), ...(isHex(accentColor) ? [accentColor] : [])])];

  const swatch = (hex: string, active: boolean, pick: () => void, label: string) => (
    <button key={hex} type="button" onClick={pick} disabled={!colorsAllowed} aria-label={label} aria-pressed={active}
      className={`h-10 w-10 rounded-xl border transition ${active ? "ring-2 ring-ink ring-offset-2" : "border-line"} disabled:cursor-not-allowed disabled:opacity-60`} style={{ background: hex }} />
  );

  return (
    <form action={saveBranding} className="card space-y-6">
      <div><p className="eyebrow">Branding</p><h2 className="mt-1 text-lg font-bold">Your brand kit</h2>
        <p className="mt-1 text-sm text-muted">Upload your logo and 5ime picks your brand colours from it. On Pro and Premium they’re used on your staff sign-in page, the staff app, the admin area, the app icon on staff phones, the browser tab, visitors’ pages, the reception poster and emails. On Basic your logo shows in the app and admin area. Green, amber and red always keep their meaning: on time, late, absent.</p></div>

      <div>
        <label className="label" htmlFor="slug">Company link</label>
        <div className="flex items-center overflow-hidden rounded-xl border border-line bg-white focus-within:ring-2 focus-within:ring-ink/10">
          <span className="whitespace-nowrap border-r border-line bg-paper px-3 py-2.5 text-sm text-muted">{siteUrl.replace(/^https?:\/\//, "")}/</span>
          <input id="slug" name="slug" defaultValue={slug} required minLength={3} maxLength={40} pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" className="w-full px-3 py-2.5 text-sm outline-none" />
        </div>
        <p className="mt-1 text-xs text-muted">Lowercase letters, numbers and dashes. Current link: <a className="underline" href={`${siteUrl}/${slug}`} target="_blank" rel="noreferrer">{siteUrl}/{slug}</a></p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end">
        <div className="flex h-16 w-40 items-center justify-center rounded-xl border border-dashed border-line bg-paper p-2">
          {preview ? <img src={preview} alt="Logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted">No logo yet</span>}
        </div>
        <div>
          <label className="label" htmlFor="logo">Upload your logo</label>
          <input ref={fileRef} id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="input py-2"
            onChange={(e) => { void chooseLogo(e.target.files?.[0]); }} />
          <div className="mt-2 rounded-xl bg-paper px-3 py-2 text-xs leading-5 text-muted">
            <b className="text-ink">Best: a PNG with a transparent background</b>, at least 500 px wide.<br />
            Also accepted: SVG, JPG or WebP on a white background. SVG logos are turned into a PNG automatically.<br />
            Avoid logos on a coloured or photo background, because we read your brand colours from the logo.
          </div>
          {fileError && <p role="alert" className="mt-2 text-sm text-bad">{fileError}</p>}
          {logoUrl && <label className="mt-2 flex items-center gap-2 text-xs text-muted"><input type="checkbox" name="remove_logo" /> Remove current logo</label>}
        </div>
      </div>

      {!colorsAllowed && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-warn">
        <p>Your logo shows in the app on every plan. Your colours on the sign-in page, app icon, browser tab and emails are part of Pro and Premium. <Link href="/admin/billing" className="font-semibold underline">see plans</Link>.</p>
        <UpgradeTour reason="branding" label="See what Pro adds" />
      </div>}
      {autoPicked && colorsAllowed && <p className="rounded-xl bg-[#eef6f1] px-4 py-3 text-sm text-ok">We picked these colours from your logo. Check the preview and change them if you like, then save.</p>}

      <div className="space-y-4">
        {choices.length > 0 && <p className="text-sm text-muted">Colours from your logo — click to use them:</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset className="space-y-2">
            <legend className="text-sm font-bold">Main colour <span className="font-normal text-muted">· headers, main buttons, poster</span></legend>
            <div className="flex flex-wrap items-center gap-2">
              {choices.map((c) => swatch(c, main.toLowerCase() === c.toLowerCase(), () => setMain(c), `Use ${c} as the main colour`))}
              <input type="color" aria-label="Pick any main colour" disabled={!colorsAllowed} value={isHex(main) ? main : "#182126"} onChange={(e) => setMain(e.target.value)} className="h-10 w-12 cursor-pointer rounded-xl border border-line bg-white p-1 disabled:opacity-60" />
              {main && colorsAllowed && <button type="button" onClick={() => setMain("")} className="text-xs text-muted underline">Use 5imes’ colours</button>}
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-bold">Accent colour <span className="font-normal text-muted">· highlights, links, badge</span></legend>
            <div className="flex flex-wrap items-center gap-2">
              {choices.map((c) => swatch(c, accent.toLowerCase() === c.toLowerCase(), () => setAccent(c), `Use ${c} as the accent colour`))}
              <input type="color" aria-label="Pick any accent colour" disabled={!colorsAllowed} value={isHex(accent) ? accent : "#e65b35"} onChange={(e) => setAccent(e.target.value)} className="h-10 w-12 cursor-pointer rounded-xl border border-line bg-white p-1 disabled:opacity-60" />
              {accent && colorsAllowed && <button type="button" onClick={() => setAccent("")} className="text-xs text-muted underline">None</button>}
            </div>
          </fieldset>
        </div>
        <input type="hidden" name="brand_color" value={main} />
        <input type="hidden" name="accent_color" value={accent} />
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold">Preview</p>
          <span className={`chip ${ratio >= 4.5 ? "bg-green-50 text-ok" : "bg-amber-50 text-warn"}`}>{theme.onPrimary === "#ffffff" ? "White" : "Dark"} text · contrast {ratio.toFixed(1)}:1</span></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-line">
            <div className="flex items-center gap-3 px-4 py-3" style={{ background: theme.primary, color: theme.onPrimary }}>
              {preview && <img src={preview} alt="" className="h-8 w-auto max-w-[90px] rounded bg-white/95 object-contain p-1" />}
              <span className="text-sm font-bold">Visitor sign-in</span>
            </div>
            <div className="space-y-2 bg-paper p-4">
              <div className="rounded-xl border border-line bg-white px-3 py-2 text-sm" style={{ borderLeft: `5px solid ${theme.accent}` }}><b>Amaka Eze</b><span className="block text-xs text-muted">Visitor · Meeting</span></div>
              <div className="rounded-xl py-2.5 text-center text-sm font-bold" style={{ background: theme.primary, color: theme.onPrimary }}>Send to reception</div>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-line bg-white">
            <div className="px-4 py-3" style={{ borderBottom: `4px solid ${theme.accent}` }}>{preview ? <img src={preview} alt="" className="h-7 w-auto max-w-[110px] object-contain" /> : <span className="font-bold">Your company</span>}</div>
            <div className="space-y-2 p-4 text-sm"><p className="font-bold">You’re invited</p><p className="text-muted">An invitation email with your logo and colours.</p>
              <span className="inline-block rounded-lg px-3 py-2 text-xs font-bold" style={{ background: theme.primary, color: theme.onPrimary }}>I’ve arrived — check in</span>
              <p className="text-xs font-semibold" style={{ color: theme.accentText }}>Map and directions</p></div>
          </div>
        </div>
        {ratio < 4.5 && <p className="text-xs text-warn">This colour is hard to read on. We’ll darken it slightly where text sits on it.</p>}
      </div>

      <div className="flex justify-end border-t border-line pt-4"><button className="btn-primary">Save branding</button></div>
    </form>
  );
}
