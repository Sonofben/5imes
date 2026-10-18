"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { useCaptcha, isCaptchaError, CAPTCHA_MESSAGE } from "@/components/Captcha";

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
}

export function ForgotPasswordForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const captcha = useCaptcha();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    // Deliberately fire-and-forget: we always show the same success state so
    // the response does not reveal whether an account exists for that email.
    setError(null);
    const captchaToken = await captcha.getToken();
    const result = await createClient().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${siteUrl()}/auth/callback?type=recovery`,
      captchaToken,
    }).catch(() => null);
    captcha.reset();
    setBusy(false);
    // The security check and rate limits are the only failures we report; neither reveals whether the account exists.
    if (result?.error && isCaptchaError(result.error.message)) { setError(CAPTCHA_MESSAGE); return; }
    if (result?.error && /rate|too many/i.test(result.error.message)) { setError("Too many requests. Wait a few minutes and try again."); return; }
    setSent(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#faf9f6] px-4 py-10">
      <div className="w-full max-w-[430px]">
        <div className="mb-6 text-center"><Logo href="/" /></div>
        <div className="card space-y-4 p-5 sm:p-6">
          <div>
            <p className="eyebrow">Reset password</p>
            <h1 className="mt-1 text-xl font-bold">Forgot your password?</h1>
            <p className="mt-1 text-sm text-muted">Enter your work email. If the account exists, we’ll send a reset link that expires in one hour.</p>
          </div>
          {sent ? (
            <>
              <p role="status" className="rounded-xl border border-[#c8dfd1] bg-[#f1f8f3] p-3 text-sm leading-6 text-[#245c3e]">
                If an account exists for <b>{email}</b>, we’ve sent a reset link. Check your inbox (and spam folder) and open it from this device.
              </p>
              <Link href="/login" className="btn-ghost w-full text-center">Back to sign in</Link>
            </>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="label" htmlFor="fp-email">Work email</label>
                <input id="fp-email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              {captcha.slot}
              {error && <p role="alert" className="rounded-lg bg-[#fff3ee] px-3 py-2.5 text-sm leading-5 text-bad">{error}</p>}
              <button className="btn-primary w-full" disabled={busy || !email.trim()}>{busy ? "Sending…" : "Send reset link"}</button>
              <p className="text-center text-xs text-muted"><Link href="/login" className="underline">Back to sign in</Link></p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
