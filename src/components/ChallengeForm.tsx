"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

export function ChallengeForm({ factorId, next }: { factorId: string; next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"totp" | "recovery">("totp");
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitTotp(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setBusy(true);
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    setBusy(false);
    if (error) { setError(error.message); return; }
    router.replace(next); router.refresh();
  }

  async function submitRecovery(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setBusy(true);
    const result = await fetch("/api/security/recovery-signin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: recovery }) })
      .then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (!result?.ok) { setError(result?.error ?? "Could not verify that recovery code."); return; }
    // The server has logged a `recovery_used` event; requireMember's grace
    // window will let the user through on aal1 while they re-enroll TOTP.
    router.replace("/admin/security?msg=" + encodeURIComponent("Recovery code accepted. Please re-enrol your authenticator app — the grace window is 10 minutes."));
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#faf9f6] px-4 py-10">
      <div className="w-full max-w-[430px]">
        <div className="mb-6 text-center"><Logo href="/" /></div>
        <div className="card space-y-4 p-5 sm:p-6">
          <div>
            <p className="eyebrow">Two-factor</p>
            <h1 className="mt-1 text-xl font-bold">{mode === "totp" ? "Enter your authenticator code" : "Use a recovery code"}</h1>
            <p className="mt-1 text-sm text-muted">{mode === "totp" ? "Open the app on your phone and type the current 6-digit code." : "Enter one of the single-use codes you saved when you turned on two-factor."}</p>
          </div>

          {mode === "totp" ? (
            <form onSubmit={submitTotp} className="space-y-3">
              <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} className="input text-center text-lg tracking-[0.4em]" placeholder="000000"/>
              {error && <p role="alert" className="rounded-lg bg-[#fff3ee] px-3 py-2 text-sm text-bad">{error}</p>}
              <button className="btn-primary w-full" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Continue"}</button>
              <button type="button" className="w-full text-xs text-muted underline" onClick={() => { setMode("recovery"); setError(null); }}>Lost your phone? Use a recovery code</button>
            </form>
          ) : (
            <form onSubmit={submitRecovery} className="space-y-3">
              <input autoComplete="one-time-code" required value={recovery} onChange={(e) => setRecovery(e.target.value)} className="input text-center font-mono tracking-wider" placeholder="XXXXX-XXXXX"/>
              {error && <p role="alert" className="rounded-lg bg-[#fff3ee] px-3 py-2 text-sm text-bad">{error}</p>}
              <button className="btn-primary w-full" disabled={busy || recovery.length < 8}>{busy ? "Verifying…" : "Use recovery code"}</button>
              <button type="button" className="w-full text-xs text-muted underline" onClick={() => { setMode("totp"); setError(null); }}>Back to authenticator code</button>
            </form>
          )}
          <form action="/auth/signout" method="post"><button className="w-full text-xs text-muted underline">Sign out</button></form>
        </div>
      </div>
    </main>
  );
}
