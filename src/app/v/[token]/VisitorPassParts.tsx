"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Rules and privacy notice, folded away until the visitor wants to read them. */
export function RulesAndNotice({ rules, notice }: { rules: string; notice: string }) {
  return (
    <details className="rounded-xl border border-line bg-paper px-3 py-2 text-sm">
      <summary className="cursor-pointer font-semibold">Read the visitor rules and privacy notice</summary>
      {rules && <p className="mt-2 whitespace-pre-line">{rules}</p>}
      {notice && <p className="mt-2 whitespace-pre-line text-muted">{notice}</p>}
    </details>
  );
}

/** "Arrived? Check in" — the code is filled in from the link; the visitor can still type it. */
export function CheckInCard({ token, code, phone, company, rules, notice }: { token: string; code: string; phone: string; company: string; rules: string; notice: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true); setError(null);
    const res = await fetch("/api/visit/checkin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, code: String(fd.get("code") ?? ""), phone: String(fd.get("phone") ?? ""), company: String(fd.get("company") ?? ""), rules: fd.get("rules") === "on" }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) { setBusy(false); setError(body.error ?? "We couldn’t reach the server. Check your connection and try again."); return; }
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card space-y-4 border-2 border-ink">
      <div><h2 className="text-xl font-bold">Arrived? Check in</h2>
        <p className="text-sm text-muted">Reception will be told you’re here.</p></div>
      <div><label className="label" htmlFor="ci-code">Invitation code</label>
        <input id="ci-code" name="code" defaultValue={`${code.slice(0, 4)} ${code.slice(4)}`} required maxLength={12} autoCapitalize="characters" autoComplete="off"
          className="input text-center font-mono text-2xl font-extrabold tracking-[0.2em]" /></div>
      <div><label className="label" htmlFor="ci-phone">Phone number</label>
        <input id="ci-phone" name="phone" type="tel" defaultValue={phone} maxLength={30} autoComplete="tel" className="input" /></div>
      <div><label className="label" htmlFor="ci-company">Company</label>
        <input id="ci-company" name="company" defaultValue={company} maxLength={120} autoComplete="organization" className="input" /></div>
      <RulesAndNotice rules={rules} notice={notice} />
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="rules" required className="mt-0.5 h-5 w-5" />
        <span>I accept the visitor rules and the privacy notice.</span></label>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-bad">{error}</p>}
      <button disabled={busy} className="btn-primary w-full py-3.5 text-base">{busy ? "Sending…" : "Send to reception"}</button>
    </form>
  );
}

/** Checks every few seconds whether reception has decided, then reloads the page to show it. */
export function LiveStatus({ token, status }: { token: string; status: string }) {
  const router = useRouter();
  const [since] = useState(() => Date.now());
  const [mins, setMins] = useState(0);
  useEffect(() => {
    const t = setInterval(async () => {
      setMins(Math.floor((Date.now() - since) / 60000));
      const res = await fetch(`/api/visit/status?t=${encodeURIComponent(token)}`, { cache: "no-store" }).catch(() => null);
      const body = res?.ok ? await res.json().catch(() => null) : null;
      if (body?.status && body.status !== status) router.refresh();
    }, 5000);
    return () => clearInterval(t);
  }, [router, token, status, since]);
  return <p className="text-xs text-muted" aria-live="polite">{mins < 1 ? "Waiting for reception…" : `Waiting for reception · ${mins} min`}</p>;
}

export function SignOutButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function signOut() {
    setBusy(true); setError(null);
    const res = await fetch("/api/visit/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) { setBusy(false); setError(body.error ?? "We couldn’t reach the server. Please tell reception you’re leaving."); return; }
    router.refresh();
  }
  return (
    <div className="space-y-2">
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      <button type="button" onClick={signOut} disabled={busy} className="btn-ghost w-full py-3">{busy ? "Signing out…" : "I’m leaving — sign me out"}</button>
    </div>
  );
}
