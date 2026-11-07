/**
 * A "next" destination taken from a link, made safe to redirect to: only a path on this site.
 * It must start with a single "/" — never "//host" or "/\host" (browsers treat both as another
 * site) — and contain no spaces, backslashes or control characters (browsers drop tabs and
 * newlines, which could turn "/\t/host" into "//host"). Anything else gives the fallback.
 */
export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 2000) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\s\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  return next;
}
