"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getBestPosition } from "@/lib/geo";
import { FLAG_LABELS } from "@/lib/constants";

type Result = { location_type: string; distance_m: number | null; flags: string[]; kind: string };

export function CheckInPanel({ checkedIn, expected }: { checkedIn: boolean; expected: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function go() {
    setError(null);
    setResult(null);
    try {
      setBusy("Getting your location…");
      const fix = await getBestPosition();
      setBusy("Recording…");
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
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <button
        onClick={go}
        disabled={!!busy}
        className={`flex aspect-square w-full max-w-[260px] mx-auto flex-col items-center justify-center rounded-full text-white shadow-xl transition active:scale-95 disabled:opacity-70 ${
          checkedIn ? "bg-ink" : "bg-brand"
        }`}
      >
        <span className="text-3xl font-extrabold">{busy ? "…" : checkedIn ? "Check out" : "Check in"}</span>
        <span className="mt-1 text-sm opacity-80">
          {busy ?? (expected === "off" ? "Non-working day" : `Today: ${expected === "home" ? "Home" : "Office"}`)}
        </span>
      </button>

      {error && <p className="rounded-xl bg-red-50 p-3 text-center text-sm text-bad">{error}</p>}

      {result && (
        <div
          className={`rounded-xl p-3 text-center text-sm ${
            result.flags.length ? "bg-amber-50 text-warn" : "bg-green-50 text-ok"
          }`}
        >
          <b>{result.kind === "in" ? "Checked in" : "Checked out"}</b>{" "}
          {result.location_type === "none"
            ? "— not at an approved location"
            : `at ${result.location_type === "office" ? "the office" : "home"}`}
          {result.flags.length > 0 && <div className="mt-1">{result.flags.map((f) => FLAG_LABELS[f] ?? f).join(" · ")}</div>}
        </div>
      )}
    </div>
  );
}
