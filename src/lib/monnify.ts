import { createAdminClient } from "@/lib/supabase/server";
import { applyPayment } from "@/lib/paystack";
import { signatureMatches } from "@/lib/monnifySignature";

/**
 * Moniepoint's online payment gateway (Monnify): card, bank transfer and USSD.
 * One-off payments per term (no automatic renewal). Docs: https://developers.monnify.com
 *   POST /api/v1/auth/login                         Basic base64(apiKey:secretKey) → access token
 *   POST /api/v1/merchant/transactions/init-transaction   amount in naira, returns checkoutUrl
 *   GET  /api/v2/merchant/transactions/query?paymentReference=…   authoritative status
 * Webhooks are signed: header `monnify-signature` = HMAC-SHA512(secretKey, raw body), hex.
 */
const BASE = (process.env.MONNIFY_BASE_URL || "https://api.monnify.com").replace(/\/+$/, "");

export function monnifyEnabled() {
  return !!(process.env.MONNIFY_API_KEY && process.env.MONNIFY_SECRET_KEY && process.env.MONNIFY_CONTRACT_CODE
    && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

type Envelope<T> = { requestSuccessful: boolean; responseMessage: string; responseCode: string; responseBody: T };

let cachedToken: { token: string; expires: number } | null = null;

async function token() {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.token;
  const basic = Buffer.from(`${process.env.MONNIFY_API_KEY}:${process.env.MONNIFY_SECRET_KEY}`).toString("base64");
  const res = await fetch(`${BASE}/api/v1/auth/login`, { method: "POST", headers: { Authorization: `Basic ${basic}` }, cache: "no-store" });
  const json = (await res.json().catch(() => null)) as Envelope<{ accessToken: string; expiresIn: number }> | null;
  if (!res.ok || !json?.requestSuccessful || !json.responseBody?.accessToken) {
    throw new Error(`Moniepoint sign-in failed: ${json?.responseMessage ?? res.status}`);
  }
  cachedToken = { token: json.responseBody.accessToken, expires: Date.now() + Math.max(60, json.responseBody.expiresIn ?? 3000) * 1000 };
  return cachedToken.token;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json?.requestSuccessful) throw new Error(`Moniepoint: ${json?.responseMessage ?? `request failed (${res.status})`}`);
  return json.responseBody;
}

export async function monnifyInit(p: { reference: string; amountKobo: number; email: string; name: string; description: string; redirectUrl: string }) {
  const body = await call<{ checkoutUrl: string; transactionReference: string }>("/api/v1/merchant/transactions/init-transaction", {
    method: "POST",
    body: JSON.stringify({
      amount: Number((p.amountKobo / 100).toFixed(2)),   // naira
      customerName: p.name.slice(0, 100),
      customerEmail: p.email,
      paymentReference: p.reference,
      paymentDescription: p.description.slice(0, 100),
      currencyCode: "NGN",
      contractCode: process.env.MONNIFY_CONTRACT_CODE,
      redirectUrl: p.redirectUrl,
      paymentMethods: ["CARD", "ACCOUNT_TRANSFER", "USSD"],
    }),
  });
  if (!body?.checkoutUrl) throw new Error("Moniepoint did not return a checkout link.");
  return body;
}

export type MonnifyStatus = { paymentStatus: string; amountPaid: number | string; currency?: string; currencyCode?: string; paymentReference?: string };

export async function monnifyStatus(reference: string) {
  return call<MonnifyStatus>(`/api/v2/merchant/transactions/query?paymentReference=${encodeURIComponent(reference)}`);
}

export function monnifySignatureValid(rawBody: string, signature: string | null) {
  return signatureMatches(rawBody, signature, process.env.MONNIFY_SECRET_KEY);
}

/**
 * Ask Moniepoint for the real status of one of our references and record it.
 * Only PAID applies the payment; the amount must equal what we reserved.
 */
export async function settleMonnify(reference: string): Promise<{ ok: boolean; status: string; reason: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, status: "unknown", reason: "service role key missing" };
  const { data: payment } = await admin.from("payments").select("reference,status,amount_kobo,provider").eq("reference", reference).maybeSingle();
  if (!payment || payment.provider !== "monnify") return { ok: false, status: "unknown", reason: "not a Moniepoint payment of this app" };
  if (payment.status === "applied") return { ok: true, status: "PAID", reason: "already applied" };
  const st = await monnifyStatus(reference);
  const status = String(st.paymentStatus || "").toUpperCase();
  if (status === "PAID") {
    const kobo = Math.round(Number(st.amountPaid) * 100);
    const result = await applyPayment({ reference, status: "success", amount: kobo, currency: (st.currencyCode || st.currency || "NGN").toUpperCase() });
    return { ok: result.ok, status, reason: result.reason };
  }
  if (["FAILED", "EXPIRED", "REVERSED", "CANCELLED"].includes(status)) {
    await admin.from("payments").update({ status: "failed" }).eq("reference", reference).eq("status", "pending");
    return { ok: false, status, reason: "payment not successful" };
  }
  return { ok: false, status: status || "PENDING", reason: "still in progress" };
}
