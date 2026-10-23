"use client";

import { useState } from "react";
import { Logo } from "@/components/Logo";

/** First-time setup: an admin creates a pairing code under Visitors → Settings and types it here. */
export function PairTablet({ notice }: { notice?: string }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function pair(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await fetch("/api/kiosk/pair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res?.ok) { setError(body?.error ?? "Pairing failed. Check the code and try again."); return; }
    window.location.reload();
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6">
      <form onSubmit={pair} className="card w-full max-w-md space-y-5 p-8 text-center">
        <Logo />
        <h1 className="text-2xl font-bold">Set up this reception tablet</h1>
        {notice && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-warn">{notice}</p>}
        <p className="text-sm text-muted">On a computer, an admin opens <b>Visitors → Settings → Reception tablets</b>, adds a tablet, and gets an 8-character code. Type it here. The code works once and expires after 15 minutes.</p>
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} autoComplete="off" aria-label="Pairing code"
          className="input text-center font-mono text-3xl tracking-[0.3em]" placeholder="ABCD2345" />
        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-bad">{error}</p>}
        <button className="btn-primary w-full" disabled={busy || code.trim().length < 8}>{busy ? "Pairing…" : "Pair tablet"}</button>
      </form>
    </main>
  );
}
