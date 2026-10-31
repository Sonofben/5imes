/** Round profile picture, or initials when there is none. */
export function Avatar({ name, url, size = 48, ring }: { name: string; url?: string | null; size?: number; ring?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  const style = { width: size, height: size, boxShadow: ring ? `0 0 0 3px #fff, 0 0 0 6px ${ring}` : undefined };
  return url
    ? <img src={url} alt="" style={style} className="shrink-0 rounded-full object-cover" />
    : <span aria-hidden="true" style={{ ...style, fontSize: Math.round(size * 0.38) }} className="grid shrink-0 place-items-center rounded-full bg-ink font-extrabold text-white">{initials}</span>;
}
