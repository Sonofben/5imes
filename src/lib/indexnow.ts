import "server-only";
import { publicOrigin } from "./site";

/**
 * IndexNow tells Bing (which powers ChatGPT search and Copilot), Yandex and others that pages are new
 * or changed, so they are crawled within hours instead of weeks. Needs INDEXNOW_KEY in .env
 * (8 to 128 letters, numbers or dashes). The key is served at /api/indexnow-key.
 */
export function indexNowKey() {
  const k = process.env.INDEXNOW_KEY ?? "";
  return /^[A-Za-z0-9-]{8,128}$/.test(k) ? k : null;
}

export async function submitToIndexNow(urls: string[]) {
  const key = indexNowKey();
  if (!key || !urls.length || process.env.APP_ENV === "staging") return false;
  const origin = publicOrigin();
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: new URL(origin).host, key, keyLocation: `${origin}/api/indexnow-key`, urlList: urls.slice(0, 10000) }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok && res.status !== 202) throw new Error(`IndexNow answered ${res.status}`);
  return true;
}
