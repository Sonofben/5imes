"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { BRAND, isPublicEmail } from "@/lib/constants";

const authConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const queryError = new URLSearchParams(window.location.search).get("error");
    if (queryError) setError(queryError);
    else if (!authConfigured) setError("Supabase is not connected yet. Add the project URL and anon key to enable sign-in.");
  }, []);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!authConfigured) { setError("Connect Supabase in the server environment before signing in."); return; }
    if (isPublicEmail(email)) {
      setError("Use your company email (for example, you@yourcompany.com). Public email domains aren’t allowed.");
      return;
    }
    setBusy(true);
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${siteUrl()}/auth/callback` },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
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
    if (error) setError(error.message);
  }

  return <main className="min-h-screen bg-[#faf9f6] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(420px,.9fr)]">
    <aside className="relative hidden overflow-hidden bg-[#192522] px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-20">
      <div aria-hidden className="absolute -right-28 top-24 h-80 w-80 rounded-full bg-[#517262]/30 blur-3xl" />
      <div className="relative"><Logo href="/" light/><p className="mt-16 max-w-lg text-4xl font-semibold leading-tight tracking-tight">Good work deserves a clear record.</p><p className="mt-4 max-w-md text-sm leading-7 text-white/70">Sign in to keep your team’s office and home workdays in sync—without turning attendance into a daily chase.</p></div>
      <div className="relative space-y-4 border-t border-white/15 pt-6 text-sm"><p className="flex items-start gap-3"><span className="mt-1 h-2 w-2 rounded-full bg-[#ec8668]"/><span>One tap to check in from an approved place.</span></p><p className="flex items-start gap-3"><span className="mt-1 h-2 w-2 rounded-full bg-[#9ab6a6]"/><span>Schedules, overnight shifts and local time zones, together.</span></p><p className="pt-3 text-xs text-white/50">{BRAND.tagline}</p></div>
    </aside>

    <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
      <div className="w-full max-w-[430px]">
        <div className="mb-8 lg:hidden"><Logo href="/"/><p className="mt-2 text-sm text-muted">{BRAND.tagline}</p></div>
        <div className="mb-5"><p className="eyebrow">Your team workspace</p><h1 className="mt-2 text-2xl font-bold tracking-tight">Sign in to 5ime</h1><p className="mt-2 text-sm leading-6 text-muted">Use the work account connected to your organization.</p></div>
        <div className="card space-y-4 p-5 sm:p-6">
          <button type="button" onClick={() => oauth("azure")} disabled={!authConfigured || busy} className="btn-ghost w-full"><MicrosoftIcon/> Continue with Microsoft</button>
          <button type="button" onClick={() => oauth("google")} disabled={!authConfigured || busy} className="btn-ghost w-full"><GoogleIcon/> Continue with Google Workspace</button>
          <div className="flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line"/><span>or use company email</span><span className="h-px flex-1 bg-line"/></div>
          {sent ? <div role="status" className="rounded-xl border border-[#c8dfd1] bg-[#f1f8f3] p-4 text-sm leading-6 text-[#245c3e]">Sign-in link sent to <b>{email}</b>. Open it from the same device to continue.</div> : <form onSubmit={sendLink} className="space-y-3"><div><label className="label" htmlFor="work-email">Work email</label><input id="work-email" className="input" type="email" autoComplete="email" required placeholder="you@yourcompany.com" value={email} onChange={(e) => setEmail(e.target.value)}/></div><button className="btn-primary w-full" disabled={busy || !authConfigured}>{busy ? "Sending sign-in link…" : "Email me a sign-in link"}</button></form>}
          {error && <p role="alert" aria-live="polite" className="rounded-lg bg-[#fff3ee] px-3 py-2.5 text-sm leading-5 text-bad">{error}</p>}
          <p className="text-xs leading-5 text-muted">Only company email domains can join a workspace. Your organization admin controls invitations and approvals.</p>
        </div>
        <p className="mt-6 text-center text-xs leading-5 text-muted">New company? Sign in with your work email to create its workspace.</p>
      </div>
    </section>
  </main>;
}

function MicrosoftIcon() {
  return <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>;
}

function GoogleIcon() {
  return <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>;
}
