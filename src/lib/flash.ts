import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Messages shown after an action ("Saved", "That email is already invited") travel in the
 * page link. Unsigned, anyone could craft a 5ime link that shows any text on our site
 * ("Your account is locked — call 0803…"). So every message we put in a link is signed,
 * and a page only shows a message whose signature matches.
 *
 *   redirect(`/admin/staff?${flashQuery({ error: "…" })}`)
 *   <Flash {...readFlash(searchParams)} />
 */
const KINDS = ["msg", "error"] as const;
type Kind = (typeof KINDS)[number];

function secret(): string {
  return process.env.FLASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function sign(kind: Kind, text: string): string {
  return createHmac("sha256", `5ime-flash:${secret()}`).update(`${kind}\n${text}`).digest("base64url").slice(0, 22);
}

function matches(expected: string, given: string | undefined): boolean {
  if (!given) return false;
  const a = Buffer.from(expected), b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Build a query string. `msg` and `error` are signed; other keys are passed through. */
export function flashQuery(params: Record<string, string | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    const text = String(v).slice(0, 400);
    q.set(k, text);
    if ((KINDS as readonly string[]).includes(k)) q.set(`${k[0]}s`, sign(k as Kind, text));
  }
  return q.toString();
}

type SearchParams = Record<string, string | string[] | undefined>;

/** Read signed messages from a page's search params. Unsigned or altered text is ignored. */
export function readFlash(sp: SearchParams | undefined): { msg?: string; error?: string } {
  const out: { msg?: string; error?: string } = {};
  if (!sp) return out;
  const allowUnsigned = !secret() && process.env.NODE_ENV !== "production";
  for (const kind of KINDS) {
    const raw = sp[kind];
    const text = Array.isArray(raw) ? raw[0] : raw;
    if (!text) continue;
    const sig = sp[`${kind[0]}s`];
    if (allowUnsigned || matches(sign(kind, text), Array.isArray(sig) ? sig[0] : sig)) out[kind] = text;
  }
  return out;
}
