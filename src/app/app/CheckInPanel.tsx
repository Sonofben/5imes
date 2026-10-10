"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getBestPosition } from "@/lib/geo";
import { FLAG_LABELS } from "@/lib/constants";

type Result = { location_type: string; distance_m: number | null; flags: string[]; kind: string };

export function CheckInPanel({ checkedIn, expected, sessionLabel }: { checkedIn: boolean; expected: string; sessionLabel: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function go() {
    setError(null);
    setResult(null);
    try {
      setBusy("Getting a fresh location…");
      const fix = await getBestPosition();
      setBusy("Recording your attendance…");
      const supabase = createClient();
      const { data, error } = await supabase.rpc("check_in", {
        p_kind: checkedIn ? "out" : "in",
        p_lat: fix.lat,
        p_lng: fix.lng,
        p_accuracy: fix.accuracy,
        p_user_agent: navigator.userAgent,
      });
      if (error) throw new Error(error.message);
      setResult(data as Result);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn’t record this attendance event. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={go}
        disabled={!!busy}
        aria-busy={!!busy}
        aria-label={busy ? busy : checkedIn ? "Check out of your current work session" : "Check in to your work session"}
        className={`flex min-h-[116px] w-full items-center justify-between gap-4 rounded-2xl px-5 py-5 text-left text-white shadow-sm transition hover:brightness-105 active:scale-[0.99] disabled:cursor-wait disabled:opacity-75 sm:px-6 ${checkedIn ? "bg-ink" : "bg-brand"}`}
      >
        <span><span className="block text-xl font-bold sm:text-2xl">{busy ?? (checkedIn ? "Check out" : "Check in")}</span><span className="mt-1 block text-sm text-white/80">{busy ? "Please keep this screen open" : checkedIn ? "End your current session" : expected === "off" ? "Today is a non-working day" : `Scheduled: ${expected}`}</span></span>
        <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/15 text-2xl">{checkedIn ? "↗" : "→"}</span>
      </button>
      {checkedIn && sessionLabel && <p className="text-center text-xs text-muted">Current session · {sessionLabel}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-bad">{error}</p>}
      {result && <div role="status" aria-live="polite" className={`rounded-xl border p-3 text-sm ${result.flags.length ? "border-amber-200 bg-amber-50 text-warn" : "border-green-200 bg-green-50 text-ok"}`}>
        <b>{result.kind === "in" ? "Check-in recorded" : "Check-out recorded"}</b>{" "}
        {result.location_type === "none" ? "— outside approved locations" : `at ${result.location_type === "office" ? "an office" : "home"}`}
        {result.flags.length > 0 && <div className="mt-1">{result.flags.map((flag) => FLAG_LABELS[flag] ?? flag).join(" · ")}</div>}
      </div>}
      <p className="text-center text-xs leading-5 text-muted">A fresh GPS reading is checked against your organization’s approved locations.</p>
    </div>
  );
}
