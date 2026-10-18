import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";
import { friendly } from "@/lib/errors";
import { flashQuery } from "@/lib/flash";

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

  const tokenHash = url.searchParams.get("token_hash");
  const supabase = await createClient();

  if (tokenHash && type && OTP_TYPES.has(type)) {
    // Email links built from {{ .TokenHash }} work on any device: unlike ?code=,
    // they don't need the PKCE verifier cookie from the browser that asked.
    // Admin invitations have no verifier at all, so they must use this path.
    const { error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash });
    if (error) return NextResponse.redirect(`${base}/login?${flashQuery({ error: linkError(error) })}`);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error && isMissingVerifier(error.message) && type !== "recovery") {
      // The link was opened on a different device or browser from the one that
      // signed up. Supabase has already confirmed the email before sending the
      // person here; only the automatic sign-in can't happen on this device.
      // So treat it as success and let them sign in with their password.
      return NextResponse.redirect(`${base}/login?${flashQuery({ msg: "Your email is confirmed. Sign in with your email and password to continue." })}`);
    }
    if (error) return NextResponse.redirect(`${base}/login?${flashQuery({ error: linkError(error) })}`);
  } else {
    // Provider text (error_description) is not shown as-is: it comes from the link, which anyone can edit.
    if (errorDesc) friendly(new Error(errorDesc), "auth/callback/provider");
    return NextResponse.redirect(`${base}/login?${flashQuery({ error: "That sign-in link is invalid or has expired. Try again." })}`);
  }

  if (type === "recovery") return NextResponse.redirect(`${base}/auth/reset`);
  if (type === "invite") return NextResponse.redirect(`${base}/auth/invite`);
  return NextResponse.redirect(`${base}${next || "/start"}`);
}

const OTP_TYPES = new Set(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

function isMissingVerifier(message: string) {
  return /code verifier|code_verifier|both auth code and code verifier/i.test(message);
}

function linkError(error: { message: string }) {
  const message = error.message;
  return isMissingVerifier(message)
    ? "This password-reset link was opened on a different device. Request a new link from this device under “Forgot password?”."
    : /expired|invalid/i.test(message)
      ? "That link has expired or was already used. Request a new one."
      : friendly(error, "auth/callback");
}
