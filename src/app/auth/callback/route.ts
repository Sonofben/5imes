import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";

/**
 * Single auth callback used by every email we send:
 *
 * - OAuth and password-signup verification links  → ?code=... (PKCE exchange)
 * - Password reset emails                         → ?code=... + type=recovery
 * - User-invitation links                         → ?code=... + type=invite
 * - One-time email codes (6-digit)                → do NOT come through here
 *
 * We exchange the code for a session, then route the user to the right next
 * page: /auth/reset for recovery, /auth/invite for invitees, or /start
 * (the standard post-sign-in dispatcher) for ordinary sign-ins. The `next`
 * query param lets a caller override the final destination.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = siteUrl(request);
  const code = url.searchParams.get("code");
  const type = url.searchParams.get("type"); // may be absent; we also sniff below
  const next = url.searchParams.get("next");
  const errorDesc = url.searchParams.get("error_description");

  if (!code) {
    return NextResponse.redirect(`${base}/login?error=${encodeURIComponent(errorDesc || "Sign-in failed")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${base}/login?error=${encodeURIComponent(error.message)}`);
  }

  if (type === "recovery") return NextResponse.redirect(`${base}/auth/reset`);
  if (type === "invite") return NextResponse.redirect(`${base}/auth/invite`);
  return NextResponse.redirect(`${base}${next || "/start"}`);
}
