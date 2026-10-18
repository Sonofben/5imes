/**
 * One logger for server and browser.
 *
 * Server: writes one JSON line per event to stdout/stderr (read with `docker logs fivetime-web`),
 * and, when ERROR_TRACKING_DSN is set (GlitchTip or Sentry DSN), also sends errors there.
 * Browser: writes to the console only.
 *
 * Never log secrets, passwords, tokens, full card or bank numbers. Pass ids, not documents.
 */
type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const isServer = typeof window === "undefined";

/** Short reference shown to the user ("ref 7KQ2MD") and written next to the full error in the log. */
export function newRef(): string {
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 6).toUpperCase();
}

function scrub(fields: Fields): Fields {
  const out: Fields = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = /pass(word)?|secret|token|key|authorization|cookie/i.test(k) ? "[removed]" : v;
  }
  return out;
}

function write(level: Level, event: string, fields: Fields = {}) {
  const line = { time: new Date().toISOString(), level, event, ...scrub(fields) };
  if (!isServer) {
    (level === "error" ? console.error : level === "warn" ? console.warn : console.info)(event, line);
    return;
  }
  const text = JSON.stringify(line);
  if (level === "error") console.error(text); else console.log(text);
  if (level === "error") void sendToTracker(event, line);
}

export const log = {
  info: (event: string, fields?: Fields) => write("info", event, fields),
  warn: (event: string, fields?: Fields) => write("warn", event, fields),
  error: (event: string, fields?: Fields) => write("error", event, fields),
};

/** Log an unexpected error and return the reference to show the user. */
export function logError(where: string, err: unknown, fields: Fields = {}): string {
  const ref = newRef();
  const e = err as { message?: string; code?: string; details?: string; hint?: string; stack?: string } | null;
  log.error(where, { ref, message: e?.message ?? String(err), code: e?.code, details: e?.details, hint: e?.hint, stack: e?.stack, ...fields });
  return ref;
}

// ───────────────────────────── error tracking (GlitchTip / Sentry, optional)
// Uses the Sentry "store" endpoint, which GlitchTip also accepts. No SDK needed.
function parseDsn(dsn: string) {
  try {
    const u = new URL(dsn);
    const project = u.pathname.replace(/^\/+|\/+$/g, "");
    if (!u.username || !project) return null;
    return { key: u.username, url: `${u.protocol}//${u.host}/api/${project}/store/` };
  } catch { return null; }
}

async function sendToTracker(event: string, line: Fields) {
  const dsn = isServer ? process.env.ERROR_TRACKING_DSN : undefined;
  const target = dsn ? parseDsn(dsn) : null;
  if (!target) return;
  try {
    await fetch(target.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=5ime/1.0, sentry_key=${target.key}`,
      },
      body: JSON.stringify({
        event_id: crypto.randomUUID().replace(/-/g, ""),
        timestamp: new Date().toISOString(),
        level: "error",
        platform: "node",
        logger: event,
        environment: process.env.NODE_ENV,
        release: process.env.APP_VERSION,
        message: { formatted: `${event}: ${String(line.message ?? "")}` },
        tags: { ref: String(line.ref ?? ""), code: String(line.code ?? "") },
        extra: line,
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // The tracker being down must never break a request.
  }
}
