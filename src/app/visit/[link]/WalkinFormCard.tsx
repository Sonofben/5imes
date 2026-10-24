"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RulesAndNotice } from "@/app/v/[token]/VisitorPassParts";

export function WalkinFormCard({ link, reasons, rules, notice, button }: { link: string; reasons: { id: string; label: string }[]; rules: string; notice: string; button?: React.CSSProperties }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => String(fd.get(k) ?? "");
    setBusy(true); setError(null);
    const res = await fetch("/api/visit/walk-in", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ link, name: get("name"), phone: get("phone"), email: get("email"), company: get("company"), reason: get("reason"),
        purpose: get("purpose"), host: get("host"), rules: fd.get("rules") === "on" }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok || !body.pass) { setBusy(false); setError(body.error ?? "We couldn’t reach the server. Check your connection and try again."); return; }
    router.replace(`/v/${encodeURIComponent(body.pass)}`);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-2xl font-bold">Tell us about your visit</h1>
      <div><label className="label" htmlFor="w-name">Full name *</label><input id="w-name" name="name" required minLength={2} maxLength={120} autoComplete="name" className="input" /></div>
      <div><label className="label" htmlFor="w-phone">Phone *</label><input id="w-phone" name="phone" type="tel" required minLength={7} maxLength={30} autoComplete="tel" className="input" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="w-company">Company</label><input id="w-company" name="company" maxLength={120} autoComplete="organization" className="input" /></div>
        <div><label className="label" htmlFor="w-reason">Reason *</label>
          <select id="w-reason" name="reason" required defaultValue="" className="input"><option value="" disabled>Choose…</option>{reasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></div>
      </div>
      <div><label className="label" htmlFor="w-host">Who are you here to see? (optional)</label><input id="w-host" name="host" maxLength={120} className="input" />
        <p className="mt-1 text-xs text-muted">Not sure? Leave it blank — reception will direct you.</p></div>
      <div><label className="label" htmlFor="w-email">Email (optional)</label><input id="w-email" name="email" type="email" maxLength={254} autoComplete="email" className="input" /></div>
      <div><label className="label" htmlFor="w-purpose">Anything reception should know? (optional)</label><input id="w-purpose" name="purpose" maxLength={200} className="input" /></div>
      <RulesAndNotice rules={rules} notice={notice} />
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="rules" required className="mt-0.5 h-5 w-5" />
        <span>I accept the visitor rules and the privacy notice.</span></label>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-bad">{error}</p>}
      <button disabled={busy} style={button} className="btn-primary w-full py-3.5 text-base">{busy ? "Sending…" : "Send to reception"}</button>
    </form>
  );
}
