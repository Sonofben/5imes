"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { PasswordField } from "@/components/PasswordField";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import { passwordIssues, PASSWORD_HINT, MIN_PASSWORD_LENGTH } from "@/lib/password";
import { friendly } from "@/lib/errors";

/**
 * Reset flow (`mode="reset"`): user arrived from an email link. Supabase has
 * already converted the one-time code into a short-lived session (via
 * /auth/callback), so there's a valid session with aal1 but marked for
 * "recovery". We just let them pick a new password and sign them in.
 *
 * Invite flow (`mode="invite"`): the invitee has not had a password before.
 * Same mechanics — pick a password, then they're signed in.
 */
export function ResetPasswordForm({ mode }: { mode: "reset" | "invite" }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await createClient().auth.getUser();
      if (!data.user) {
        setError("This reset link has expired. Request a new one from the sign-in page.");
      }
      setReady(true);
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) { setError("Passwords don’t match."); return; }
    const issues = passwordIssues(password);
    if (issues.length) { setError(issues[0]); return; }

    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) { setError(friendly(error, "auth/reset")); return; }
    // Log the event (silently; failure here does not block the user).
    void createClient().rpc("log_security_event", {
      p_kind: mode === "invite" ? "password_set" : "password_reset",
      p_detail: {},
    }).then(() => undefined, () => undefined);
    window.location.assign(mode === "invite" ? "/start" : "/start?reset=1"); // full load so the server sees the new session cookie
  }

  const headline = mode === "invite" ? "Welcome — set your password" : "Choose a new password";
  const sub = mode === "invite"
    ? "Pick a password you can remember. You can change it later in Settings → Security."
    : "Enter a new password for your account. The reset link is single-use.";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#faf9f6] px-4 py-10">
      <div className="w-full max-w-[430px]">
        <div className="mb-6 text-center"><Logo href="/" /></div>
        <div className="card space-y-4 p-5 sm:p-6">
          <div>
            <p className="eyebrow">Account security</p>
            <h1 className="mt-1 text-xl font-bold">{headline}</h1>
            <p className="mt-1 text-sm text-muted">{sub}</p>
          </div>
          {!ready ? (
            <p className="text-sm text-muted">Checking link…</p>
          ) : error && !password ? (
            <>
              <p role="alert" className="rounded-lg bg-[#fff3ee] px-3 py-2.5 text-sm leading-5 text-bad">{error}</p>
              <Link href="/auth/forgot" className="btn-ghost w-full text-center">Request a new link</Link>
            </>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-1">
                <PasswordField
                  id="np-pass"
                  label="New password"
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  value={password}
                  onChange={setPassword}
                  hint={PASSWORD_HINT}
                />
                <PasswordStrengthMeter password={password} />
              </div>
              <PasswordField
                id="np-confirm"
                label="Confirm new password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                value={confirm}
                onChange={setConfirm}
              />
              {error && <p role="alert" className="rounded-lg bg-[#fff3ee] px-3 py-2.5 text-sm leading-5 text-bad">{error}</p>}
              <button className="btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
