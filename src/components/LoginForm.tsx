"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { PasswordField } from "@/components/PasswordField";
import { BRAND, isPublicEmail } from "@/lib/constants";
import { useCaptcha, isCaptchaError, CAPTCHA_MESSAGE } from "@/components/Captcha";
import { brandTheme } from "@/lib/brand";

const authConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
}

export type LoginBrand = { name: string; slug: string; logo_url: string | null; brand_color: string | null; accent_color?: string | null; domain: string };

type Mode = "password" | "code-request" | "code-verify";

export function LoginForm({ brand, initialError, initialNotice }: { brand?: LoginBrand; initialError?: string; initialNotice?: string }) {
  const theme = brand ? brandTheme({ primary: brand.brand_color, accent: brand.accent_color }) : null;
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(initialNotice ?? null);
  const [error, setError] = useState<string | null>(initialError ?? null);
  // Hidden until Supabase confirms which providers are switched on (no flash of dead buttons).
  const [providers, setProviders] = useState({ azure: false, google: false });
  const captcha = useCaptcha();

  useEffect(() => {
    if (!authConfigured) { setError("Supabase is not connected yet. Add the project URL and anon key to enable sign-in."); return; }
    // Only offer Microsoft / Google when they are switched on in Supabase Auth;
    // otherwise the button lands on a raw "provider is not enabled" error page.
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { external?: Record<string, boolean> } | null) => {
        if (s?.external) setProviders({ azure: !!s.external.azure, google: !!s.external.google });
      })
      .catch(() => undefined);
  }, []);

  function validateCompanyEmail() {
    if (isPublicEmail(email)) {
      setError("Use your company email (for example, you@yourcompany.com). Public email domains aren’t allowed.");
      return false;
    }
    return true;
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setNotice(null);
    if (!authConfigured) { setError("Connect Supabase in the server environment before signing in."); return; }
    if (!validateCompanyEmail()) return;
    setBusy(true);
    const supabase = createClient();
    const captchaToken = await captcha.getToken();
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password, options: { captchaToken } });
    captcha.reset();
    setBusy(false);
    if (error) { setError(mapAuthError(error.message)); return; }
    // If the account requires a second factor, Supabase returns a session with aal1
    // and the admin pages will redirect to the challenge page. We just push forward.
    if (!data.session) { setError("Sign-in failed."); return; }
    window.location.assign("/start"); // full load so the server sees the new session cookie
  }

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setNotice(null);
    if (!validateCompanyEmail()) return;
    setBusy(true);
    const captchaToken = await captcha.getToken();
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false, captchaToken },
    });
    captcha.reset();
    setBusy(false);
    if (error) { setError(mapAuthError(error.message)); return; }
    setMode("code-verify");
    setNotice(`We sent a sign-in code to ${email}. Check your inbox (and spam). It expires in 1 hour.`);
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    // "email" covers ordinary sign-in codes. Someone who was invited, or signed up but never
    // confirmed, is sent the invite / confirm-signup email instead, and its code is checked as that type.
    const supabase = createClient();
    const who = { email: email.trim().toLowerCase(), token: code.replace(/\s/g, "") };
    let { data, error } = await supabase.auth.verifyOtp({ ...who, type: "email" });
    for (const type of ["signup", "invite"] as const) {
      if (!error || !/expired|invalid/i.test(error.message)) break;
      ({ data, error } = await supabase.auth.verifyOtp({ ...who, type }));
    }
    setBusy(false);
    if (error) { setError(mapAuthError(error.message)); return; }
    if (!data.session) { setError("Could not sign you in. Try again."); return; }
    window.location.assign("/start"); // full load so the server sees the new session cookie
  }

  async function oauth(provider: "google" | "azure") {
    if (!authConfigured) { setError("Connect Supabase in the server environment before signing in."); return; }
    setError(null);
    const { error } = await createClient().auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${siteUrl()}/auth/callback`,
        scopes: provider === "azure" ? "email openid profile" : undefined,
        queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
      },
    });
    if (error) setError(mapAuthError(error.message));
  }

  return <main className="min-h-screen bg-[#faf9f6] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(420px,.9fr)]">
    {brand ? (
      <aside className="relative hidden overflow-hidden px-12 py-10 lg:flex lg:flex-col lg:justify-between xl:px-20" style={{ background: theme!.primary, color: theme!.onPrimary }}>
        <div className="relative">
          {brand.logo_url
            ? <img src={brand.logo_url} alt={`${brand.name} logo`} className="h-14 w-auto max-w-[220px] rounded-lg bg-white/95 object-contain p-2" />
            : <p className="text-3xl font-bold">{brand.name}</p>}
          <p className="mt-16 max-w-lg text-4xl font-semibold leading-tight tracking-tight">{brand.name} staff portal</p>
          <p className="mt-4 max-w-md text-sm leading-7 opacity-80">Sign in with your @{brand.domain} work account to check in from the office or your approved home.</p>
        </div>
        <p className="relative text-xs opacity-60">Powered by 5ime · {BRAND.tagline}</p>{brand.accent_color && <span aria-hidden className="absolute inset-x-0 bottom-0 h-2" style={{ background: theme!.accent }} />}
      </aside>
    ) : (
      <aside className="relative hidden overflow-hidden bg-[#192522] px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-20">
        <div aria-hidden className="absolute -right-28 top-24 h-80 w-80 rounded-full bg-[#517262]/30 blur-3xl" />
        <div className="relative"><Logo href="/" light/><p className="mt-16 max-w-lg text-4xl font-semibold leading-tight tracking-tight">Good work deserves a clear record.</p><p className="mt-4 max-w-md text-sm leading-7 text-white/70">Sign in to keep your team’s office and home workdays in sync—without turning attendance into a daily chase.</p></div>
        <div className="relative space-y-4 border-t border-white/15 pt-6 text-sm"><p className="flex items-start gap-3"><span className="mt-1 h-2 w-2 rounded-full bg-[#ec8668]"/><span>One tap to check in from an approved place.</span></p><p className="flex items-start gap-3"><span className="mt-1 h-2 w-2 rounded-full bg-[#9ab6a6]"/><span>Schedules, overnight shifts and local time zones, together.</span></p><p className="pt-3 text-xs text-white/50">{BRAND.tagline}</p></div>
      </aside>
    )}

    <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
      <div className="w-full max-w-[430px]">
        <div className="mb-8 lg:hidden">{brand?.logo_url
          ? <img src={brand.logo_url} alt={`${brand.name} logo`} className="h-12 w-auto max-w-[200px] object-contain" />
          : brand ? <p className="text-2xl font-bold">{brand.name}</p> : <Logo href="/"/>}<p className="mt-2 text-sm text-muted">{brand ? `Staff portal · powered by 5ime` : BRAND.tagline}</p></div>
        <div className="mb-5"><p className="eyebrow">{brand ? brand.name : "Your team workspace"}</p><h1 className="mt-2 text-2xl font-bold tracking-tight">{brand ? "Sign in to your staff portal" : "Sign in to 5ime"}</h1><p className="mt-2 text-sm leading-6 text-muted">{brand ? `Use your @${brand.domain} work account.` : "Use your work email and password. New here? Create a workspace or wait for your admin’s invitation."}</p></div>

        <div className="card space-y-4 p-5 sm:p-6">
          {providers.azure && <button type="button" onClick={() => oauth("azure")} disabled={!authConfigured || busy} className="btn-ghost w-full"><MicrosoftIcon/> Continue with Microsoft</button>}
          {providers.google && <button type="button" onClick={() => oauth("google")} disabled={!authConfigured || busy} className="btn-ghost w-full"><GoogleIcon/> Continue with Google Workspace</button>}
          {(providers.azure || providers.google) && <div className="flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line"/><span>or use work email</span><span className="h-px flex-1 bg-line"/></div>}

          {captcha.slot}
          {mode === "password" && (
            <form onSubmit={signInWithPassword} className="space-y-3">
              <div>
                <label className="label" htmlFor="work-email">Work email</label>
                <input id="work-email" className="input" type="email" autoComplete="email" required placeholder={brand ? `you@${brand.domain}` : "you@yourcompany.com"} value={email} onChange={(e) => setEmail(e.target.value)}/>
              </div>
              <PasswordField
                id="work-password"
                label="Password"
                autoComplete="current-password"
                minLength={8}
                value={password}
                onChange={setPassword}
                rightLink={<Link href={`/auth/forgot?email=${encodeURIComponent(email)}`} className="text-xs text-brand underline">Forgot password?</Link>}
              />
              <button className="btn-primary w-full" disabled={busy || !authConfigured}>{busy ? "Signing in…" : "Sign in"}</button>
              <button type="button" onClick={() => { setError(null); setNotice(null); setMode("code-request"); }} className="w-full text-xs text-muted underline">
                Can’t sign in? Use a one-time code instead
              </button>
            </form>
          )}

          {mode === "code-request" && (
            <form onSubmit={requestCode} className="space-y-3">
              <p className="text-sm text-muted">We’ll email you a one-time code. Use this if your admin hasn’t set a password for you yet or you’ve forgotten it.</p>
              <div>
                <label className="label" htmlFor="work-email">Work email</label>
                <input id="work-email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)}/>
              </div>
              <button className="btn-primary w-full" disabled={busy || !authConfigured}>{busy ? "Sending…" : "Email me a code"}</button>
              <button type="button" onClick={() => setMode("password")} className="w-full text-xs text-muted underline">Back to password sign-in</button>
            </form>
          )}

          {mode === "code-verify" && (
            <form onSubmit={verifyCode} className="space-y-3">
              <p className="text-sm text-muted">Enter the code we just emailed to <b>{email}</b>.</p>
              <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" maxLength={8} required value={code} onChange={(e) => setCode(e.target.value)} className="input text-center text-lg tracking-[0.4em]" placeholder="000000"/>
              <button className="btn-primary w-full" disabled={busy || !authConfigured || code.length !== 6}>{busy ? "Verifying…" : "Sign in"}</button>
              <button type="button" onClick={() => { setMode("code-request"); setCode(""); }} className="w-full text-xs text-muted underline">Send another code</button>
            </form>
          )}

          {notice && !error && <p role="status" aria-live="polite" className="rounded-xl border border-[#c8dfd1] bg-[#f1f8f3] p-3 text-sm leading-5 text-[#245c3e]">{notice}</p>}
          {error && <p role="alert" aria-live="polite" className="rounded-lg bg-[#fff3ee] px-3 py-2.5 text-sm leading-5 text-bad">{error}</p>}

          <p className="text-xs leading-5 text-muted">Only work email domains can join a workspace. Your organization admin controls invitations and approvals.</p>
        </div>
        {!brand && <p className="mt-6 text-center text-sm leading-5 text-muted">New company? <Link href="/signup" className="font-medium text-brand underline">Create a workspace</Link>.</p>}
      </div>
    </section>
  </main>;
}

function mapAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Email or password is wrong. If you’ve just been invited, use the link we emailed you.";
  if (m.includes("email not confirmed")) return "Please confirm your email first. Check your inbox for the verification link.";
  if (m.includes("rate")) return "Too many attempts. Wait a minute, then try again.";
  if (isCaptchaError(m)) return CAPTCHA_MESSAGE;
  if (m.includes("otp") && m.includes("expired")) return "That code has expired. Request a new one.";
  if (m.includes("otp") && m.includes("invalid")) return "That code is incorrect. Check and try again.";
  return message;
}

function MicrosoftIcon() {
  return <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>;
}

function GoogleIcon() {
  return <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>;
}
