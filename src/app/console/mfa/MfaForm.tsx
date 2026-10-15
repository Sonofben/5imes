"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Two-factor sign-in for the console: enrol an authenticator app once, then enter a 6-digit code. */
export function MfaForm() {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) { setError(error.message); return; }
      const verified = data.totp.find((f) => f.status === "verified");
      if (verified) { setFactorId(verified.id); return; }
      for (const f of data.all.filter((f) => f.status === "unverified")) await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `5ime console ${Date.now()}` });
      if (enrollError) { setError(enrollError.message); return; }
      setFactorId(enrolled.id); setQr(enrolled.totp.qr_code); setSecret(enrolled.totp.secret);
    })();
  }, []);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true); setError(null);
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    setBusy(false);
    if (error) { setError(error.message); return; }
    window.location.assign("/console"); // full load so the server sees the new session cookie
  }

  return (
    <div className="mx-auto max-w-md">
      <form onSubmit={verify} className="card space-y-4">
        <div><p className="eyebrow">Kora Forge console</p><h1 className="mt-1 text-xl font-bold">Two-factor sign-in</h1>
          <p className="mt-1 text-sm text-muted">{qr ? "First time: scan this with Google Authenticator, Microsoft Authenticator or similar, then enter the 6-digit code." : "Enter the 6-digit code from your authenticator app."}</p></div>
        {qr && <div className="flex flex-col items-center gap-2 rounded-xl bg-white p-3"><img src={qr} alt="Authenticator QR code" className="h-48 w-48" /><code className="break-all text-xs text-muted">{secret}</code></div>}
        <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} className="input text-center text-lg tracking-[0.4em]" placeholder="000000" />
        {error && <p className="text-sm text-bad">{error}</p>}
        <button className="btn-primary w-full" disabled={busy || !factorId}>{busy ? "Checking…" : "Continue"}</button>
      </form>
    </div>
  );
}
