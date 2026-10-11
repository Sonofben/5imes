"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { PasswordField } from "@/components/PasswordField";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import { BRAND, isPublicEmail } from "@/lib/constants";
import { passwordIssues, PASSWORD_HINT, MIN_PASSWORD_LENGTH } from "@/lib/password";

const authConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
}

export function SignupForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authConfigured) setError("Supabase is not connected yet.");
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setNotice(null);
    const normalisedEmail = email.trim().toLowerCase();
    if (!fullName.trim()) { setError("Enter your full name."); return; }
    if (isPublicEmail(normalisedEmail)) { setError("Use your company email, not a personal one (Gmail, Yahoo, etc.)."); return; }
    if (password !== confirm) { setError("Passwords don’t match."); return; }
    const issues = passwordIssues(password);
    if (issues.length) { setError(issues[0]); return; }

    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: normalisedEmail,
      password,
      options: {
        // Route through /start so the post-signin dispatcher handles whether
        // this user already has a membership or needs to create a company.
        emailRedirectTo: `${siteUrl()}/auth/callback`,
        data: { full_name: fullName.trim() },
      },
    });
    setBusy(false);
    if (error) { setError(mapSignUpError(error.message)); return; }

    // If email confirmation is OFF (dev only), Supabase returns a session
    // immediately. Push forward. If confirmation is ON (prod), no session yet
    // and the user must click the email link.
    if (data.session) {
      router.replace("/onboarding");
      router.refresh();
      return;
    }
    setNotice(`We’ve emailed a verification link to ${normalisedEmail}. Open it to finish creating your workspace.`);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#faf9f6] px-4 py-10">
      <div className="w-full max-w-[460px]">
        <div className="mb-6 text-center"><Logo href="/" /><p className="mt-2 text-sm text-muted">{BRAND.tagline}</p></div>
        <form onSubmit={submit} className="card space-y-4 p-5 sm:p-6">
          <div>
            <p className="eyebrow">Create a workspace</p>
            <h1 className="mt-1 text-xl font-bold">Start your 14-day free trial</h1>
            <p className="mt-1 text-sm text-muted">You’ll be the owner. Invite teammates once your workspace is set up.</p>
          </div>
          <div>
            <label className="label" htmlFor="su-name">Your full name</label>
            <input id="su-name" className="input" required minLength={2} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name"/>
          </div>
          <div>
            <label className="label" htmlFor="su-email">Work email</label>
            <input id="su-email" className="input" type="email" required autoComplete="email" placeholder="you@yourcompany.com" value={email} onChange={(e) => setEmail(e.target.value)}/>
            <p className="mt-1 text-xs text-muted">Your company’s email domain becomes its workspace domain.</p>
          </div>
          <div className="space-y-1">
            <PasswordField
              id="su-pass"
              label="Password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              value={password}
              onChange={setPassword}
              hint={PASSWORD_HINT}
            />
            <PasswordStrengthMeter password={password} />
          </div>
          <PasswordField
            id="su-confirm"
            label="Confirm password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            value={confirm}
            onChange={setConfirm}
          />
          {notice && !error && <p role="status" className="rounded-xl border border-[#c8dfd1] bg-[#f1f8f3] p-3 text-sm leading-5 text-[#245c3e]">{notice}</p>}
          {error && <p role="alert" className="rounded-lg bg-[#fff3ee] px-3 py-2.5 text-sm leading-5 text-bad">{error}</p>}
          <button className="btn-brand w-full" disabled={busy || !authConfigured}>{busy ? "Creating…" : "Create workspace"}</button>
          <p className="text-center text-xs text-muted">Already have an account? <Link href="/login" className="font-medium text-brand underline">Sign in</Link></p>
          <p className="text-center text-[11px] leading-5 text-muted">By continuing you agree to the 5ime terms. No card needed; the trial converts to a paid plan only when you add one.</p>
        </form>
      </div>
    </main>
  );
}

function mapSignUpError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "An account with that email already exists. Sign in, or use “Forgot password?” to reset.";
  }
  if (m.includes("password")) return "Password doesn’t meet requirements. Pick a stronger one.";
  if (m.includes("rate")) return "Too many sign-up attempts. Wait a minute and try again.";
  return message;
}
