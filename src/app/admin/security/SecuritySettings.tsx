"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PasswordField } from "@/components/PasswordField";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import { passwordIssues, PASSWORD_HINT, MIN_PASSWORD_LENGTH } from "@/lib/password";
import { friendly } from "@/lib/errors";
import { useCaptcha } from "@/components/Captcha";

type Props = {
  role: "owner" | "admin" | "manager" | "staff";
  requiresMfa: boolean;
  totpEnrolled: boolean;
  unusedCodes: number;
  currentAal: string | null;
};

export function SecuritySettings({ role, requiresMfa, totpEnrolled, unusedCodes, currentAal }: Props) {
  const router = useRouter();
  return (
    <>
      <ChangePasswordCard onDone={() => router.refresh()} />
      <TotpCard requiresMfa={requiresMfa} enrolled={totpEnrolled} role={role} currentAal={currentAal} onDone={() => router.refresh()} />
      {totpEnrolled && (
        <RecoveryCodesCard unused={unusedCodes} onDone={() => router.refresh()} />
      )}
    </>
  );
}

function ChangePasswordCard({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const captcha = useCaptcha();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null); setError(null);
    if (next !== confirm) { setError("New passwords don’t match."); return; }
    const issues = passwordIssues(next);
    if (issues.length) { setError(issues[0]); return; }

    setBusy(true);
    // Server-side verifies current password with a throwaway client so this
    // doesn't drop our aal2 session on the browser cookies.
    const result = await fetch("/api/security/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current, next, captchaToken: await captcha.getToken() }),
    }).then((r) => r.json()).catch(() => null);
    captcha.reset();
    setBusy(false);
    if (!result?.ok) { setError(result?.error ?? "Could not change password."); return; }
    setCurrent(""); setNext(""); setConfirm("");
    setMsg("Password updated.");
    onDone();
  }

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-bold">Change password</h2>
        <p className="text-sm text-muted">You’ll stay signed in on this device.</p>
      </div>
      <form onSubmit={submit} className="space-y-3">
        {captcha.slot}
        <PasswordField id="cp-current" label="Current password" autoComplete="current-password" value={current} onChange={setCurrent} />
        <div className="space-y-1">
          <PasswordField
            id="cp-next"
            label="New password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            value={next}
            onChange={setNext}
            hint={PASSWORD_HINT}
          />
          <PasswordStrengthMeter password={next} />
        </div>
        <PasswordField
          id="cp-confirm"
          label="Confirm new password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          value={confirm}
          onChange={setConfirm}
        />
        {msg && <p role="status" className="rounded-lg bg-[#f1f8f3] px-3 py-2 text-sm text-[#245c3e]">{msg}</p>}
        {error && <p role="alert" className="rounded-lg bg-[#fff3ee] px-3 py-2 text-sm text-bad">{error}</p>}
        <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
      </form>
    </section>
  );
}

type Phase = "idle" | "enrolling" | "verifying" | "done";

function TotpCard({ requiresMfa, enrolled, role, currentAal, onDone }: { requiresMfa: boolean; enrolled: boolean; role: string; currentAal: string | null; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>(enrolled ? "done" : "idle");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setPhase(enrolled ? "done" : "idle"); }, [enrolled]);

  async function startEnrol() {
    setError(null); setMsg(null); setBusy(true);
    const supabase = createClient();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const f of (factors?.all ?? []).filter((f) => f.status === "unverified")) {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `5ime ${Date.now()}` });
    setBusy(false);
    if (error) { setError(friendly(error, "admin/security")); return; }
    setFactorId(data.id); setQr(data.totp.qr_code); setSecret(data.totp.secret);
    setPhase("verifying");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setError(null); setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    if (error) { setBusy(false); setError(friendly(error, "admin/security")); return; }

    // Generate initial recovery codes via a server action.
    const result = await fetch("/api/security/recovery-codes", { method: "POST" }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    void supabase.rpc("log_security_event", { p_kind: "totp_enrolled", p_detail: {} }).then(() => undefined, () => undefined);
    if (result?.codes) setMsg(`Two-factor enabled. Keep these recovery codes somewhere safe — you can’t see them again: ${result.codes.join(" ")}`);
    else setMsg("Two-factor enabled. Visit the Recovery codes section to generate backup codes.");
    setPhase("done"); setCode(""); setQr(null); setSecret(null); setFactorId(null);
    onDone();
  }

  async function disable() {
    if (!confirm("Turn off two-factor for your account? Admins must have it on; you may be asked to set it up again.")) return;
    setBusy(true); setError(null);
    const supabase = createClient();
    const { data } = await supabase.auth.mfa.listFactors();
    for (const f of data?.all ?? []) await supabase.auth.mfa.unenroll({ factorId: f.id });
    void supabase.rpc("log_security_event", { p_kind: "totp_disabled", p_detail: {} }).then(() => undefined, () => undefined);
    setBusy(false); setPhase("idle"); setMsg("Two-factor removed.");
    onDone();
  }

  return (
    <section className="card space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">Two-factor (authenticator app)</h2>
          <p className="text-sm text-muted">Scan a QR code once, then enter a 6-digit code on sign-in. Works with Google Authenticator, Microsoft Authenticator, 1Password, Authy, and any TOTP-compatible app.</p>
        </div>
        <span className={`chip text-xs ${enrolled ? "bg-good/10 text-good" : "bg-paper text-muted"}`}>{enrolled ? "On" : "Off"}</span>
      </div>

      {requiresMfa && !enrolled && (
        <p role="alert" className="rounded-lg bg-[#fff6ea] px-3 py-2 text-sm text-[#8a5a00]">As a {role}, you must enable two-factor before you can access admin tools.</p>
      )}

      {phase === "idle" && (
        <button type="button" className="btn-primary" onClick={startEnrol} disabled={busy}>{busy ? "Preparing…" : "Set up two-factor"}</button>
      )}

      {phase === "verifying" && qr && (
        <form onSubmit={verify} className="space-y-3">
          <p className="text-sm text-muted">Open your authenticator app, add a new account, and scan this QR code. Or type the secret below if you can’t scan.</p>
          <div className="flex flex-col items-center gap-2 rounded-xl bg-white p-3"><img src={qr} alt="Authenticator QR code" className="h-48 w-48" /><code className="break-all text-xs text-muted">{secret}</code></div>
          <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} className="input text-center text-lg tracking-[0.4em]" placeholder="000000"/>
          {error && <p role="alert" className="rounded-lg bg-[#fff3ee] px-3 py-2 text-sm text-bad">{error}</p>}
          <button className="btn-primary w-full" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Turn on two-factor"}</button>
          <button type="button" className="w-full text-xs text-muted underline" onClick={() => setPhase("idle")}>Cancel</button>
        </form>
      )}

      {phase === "done" && enrolled && (
        <div className="space-y-3">
          {currentAal === "aal2"
            ? <p className="text-sm text-muted">This browser is signed in with two-factor (aal2).</p>
            : <p className="text-sm text-muted">Next sign-in on a new device will ask for a 6-digit code.</p>}
          <button type="button" className="btn-ghost text-sm" onClick={disable} disabled={busy}>Turn off two-factor</button>
        </div>
      )}

      {msg && <p role="status" className="rounded-lg bg-[#f1f8f3] px-3 py-2 text-sm text-[#245c3e]">{msg}</p>}
      {error && phase !== "verifying" && <p role="alert" className="rounded-lg bg-[#fff3ee] px-3 py-2 text-sm text-bad">{error}</p>}
    </section>
  );
}

function RecoveryCodesCard({ unused, onDone }: { unused: number; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function regenerate() {
    if (!confirm("Replace your recovery codes? Your old codes stop working immediately.")) return;
    setBusy(true); setError(null);
    const result = await fetch("/api/security/recovery-codes", { method: "POST" }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (!result?.codes) { setError(result?.error ?? "Could not generate codes."); return; }
    setCodes(result.codes);
    onDone();
  }

  return (
    <section className="card space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">Recovery codes</h2>
          <p className="text-sm text-muted">Single-use codes for when you lose your authenticator. Store them in a password manager or print them out.</p>
        </div>
        <span className="chip text-xs">{unused} unused</span>
      </div>
      {codes ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">Here are your new codes. You can’t see them again. Each one works once.</p>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-paper p-3 font-mono text-sm">
            {codes.map((c) => <span key={c} className="tracking-wider">{c}</span>)}
          </div>
          <button type="button" className="btn-ghost text-sm" onClick={() => { navigator.clipboard.writeText(codes.join("\n")); }}>Copy all</button>
        </div>
      ) : (
        <button type="button" className="btn-primary" onClick={regenerate} disabled={busy}>{busy ? "Generating…" : unused > 0 ? "Replace recovery codes" : "Generate recovery codes"}</button>
      )}
      {error && <p role="alert" className="rounded-lg bg-[#fff3ee] px-3 py-2 text-sm text-bad">{error}</p>}
    </section>
  );
}
