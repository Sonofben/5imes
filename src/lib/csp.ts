/**
 * Content-Security-Policy: tells the browser which sources may run scripts, load images,
 * open connections, and so on. If someone ever manages to inject HTML into a page, the
 * browser refuses to run their script because it lacks this request's nonce.
 *
 * Built per request in src/proxy.ts. When adding a new outside service (a payment page,
 * a map provider, an analytics script), add its address to the matching line below.
 */
export function buildCsp(nonce: string): string {
  const dev = process.env.NODE_ENV !== "production";
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseWs = supabase.replace(/^http/, "ws");
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'strict-dynamic' lets our nonce'd scripts load what they need (Next.js chunks, Turnstile).
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "https://challenges.cloudflare.com", ...(dev ? ["'unsafe-eval'"] : [])],
    // Inline style attributes are used by React and Leaflet; styles cannot run code.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https://*.tile.openstreetmap.org", "https://*.supabase.co"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", supabase, supabaseWs, "https://nominatim.openstreetmap.org", "https://challenges.cloudflare.com", ...(dev ? ["ws:"] : [])].filter(Boolean),
    "frame-src": ["https://challenges.cloudflare.com"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    // Checkout forms post to our API, which redirects to the payment provider's page.
    "form-action": ["'self'", "https://checkout.paystack.com", "https://*.paystack.com", "https://*.monnify.com"],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
  };
  const policy = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (!dev) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
