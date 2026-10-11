import { saveBranding } from "./actions";

export function BrandingCard({ slug, logoUrl, brandColor, siteUrl }: { slug: string; logoUrl: string | null; brandColor: string | null; siteUrl: string }) {
  return (
    <form action={saveBranding} className="card space-y-5">
      <div><p className="eyebrow">Branding</p><h2 className="mt-1 text-lg font-bold">Your staff portal</h2><p className="mt-1 text-sm text-muted">Staff see your logo when they sign in and check in. Share your company link so they always land on your portal.</p></div>
      <div>
        <label className="label" htmlFor="slug">Company link</label>
        <div className="flex items-center overflow-hidden rounded-xl border border-line bg-white focus-within:ring-2 focus-within:ring-ink/10">
          <span className="whitespace-nowrap border-r border-line bg-paper px-3 py-2.5 text-sm text-muted">{siteUrl.replace(/^https?:\/\//, "")}/</span>
          <input id="slug" name="slug" defaultValue={slug} required minLength={3} maxLength={40} pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]" className="w-full px-3 py-2.5 text-sm outline-none" />
        </div>
        <p className="mt-1 text-xs text-muted">Lowercase letters, numbers and dashes. Current link: <a className="underline" href={`${siteUrl}/${slug}`} target="_blank" rel="noreferrer">{siteUrl}/{slug}</a></p>
      </div>
      <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end">
        <div className="flex h-16 w-40 items-center justify-center rounded-xl border border-dashed border-line bg-paper p-2">
          {logoUrl ? <img src={logoUrl} alt="Current logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted">No logo yet</span>}
        </div>
        <div>
          <label className="label" htmlFor="logo">Logo (PNG, JPG or WebP, max 1 MB)</label>
          <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="input py-2" />
          {logoUrl && <label className="mt-2 flex items-center gap-2 text-xs text-muted"><input type="checkbox" name="remove_logo" /> Remove current logo</label>}
        </div>
      </div>
      <div className="flex items-end gap-4">
        <div><label className="label" htmlFor="brand-color">Brand colour</label><input id="brand-color" name="brand_color" type="color" defaultValue={brandColor ?? "#192522"} className="h-11 w-20 cursor-pointer rounded-lg border border-line bg-white p-1" /></div>
        <p className="pb-2 text-xs text-muted">Used on your sign-in page.</p>
      </div>
      <div className="flex justify-end border-t border-line pt-4"><button className="btn-primary">Save branding</button></div>
    </form>
  );
}
