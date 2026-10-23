import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient } from "./supabase/server.ts";
import { friendly } from "./errors.ts";
import { statusFor } from "./throttle.ts";

/**
 * Reception tablet ("kiosk") helpers. A paired tablet holds a long random token in an
 * httpOnly cookie; the server passes it to the kiosk_* database functions, which check it
 * and work out the company and office from it. Nothing about the company comes from the browser.
 */
export const KIOSK_COOKIE = "5ime_kiosk";

export async function kioskToken(): Promise<string | null> {
  const t = (await cookies()).get(KIOSK_COOKIE)?.value ?? "";
  return /^[A-Z2-9]{48}$/.test(t) ? t : null;
}

export function kioskAdmin() {
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return admin;
}

/** JSON error for a kiosk API call, with a message safe to show on the tablet. */
export function kioskError(error: unknown, where: string) {
  const status = statusFor(error);
  const code = (error as { code?: string } | null)?.code;
  return NextResponse.json({ error: friendly(error, `kiosk/${where}`), unpaired: code === "KF401" || code === "KF403" }, { status: status === 403 ? 401 : status });
}

/** Only accept JSON bodies from this site (blocks cross-site form posts to the tablet API). */
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  return !origin || !site || origin === site || process.env.NODE_ENV !== "production";
}
