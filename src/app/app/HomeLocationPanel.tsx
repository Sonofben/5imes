"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getBestPosition } from "@/lib/geo";

export function HomeLocationPanel({ status, hasApproved, hasPending }: { status: string; hasApproved: boolean; hasPending: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function pin() {
    setMsg(null);
    setBusy(true);
    try {
      const fix = await getBestPosition(15000, 20);
      const { error } = await createClient().rpc("request_home_location", {
        p_lat: fix.lat,
        p_lng: fix.lng,
        p_accuracy: fix.accuracy,
      });
      if (error) throw new Error(error.message);
      setMsg({ ok: true, text: `Sent for approval (accuracy ±${Math.round(fix.accuracy)}m).` });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setBusy(false);
    }
  }

  const label = hasPending
    ? "Waiting for admin approval"
    : hasApproved
      ? "Approved"
      : status === "rejected"
        ? "Rejected — pin it again from home"
        : "Not set";

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Home location</h2>
        <span
          className={`chip ${hasApproved && !hasPending ? "bg-green-50 text-ok" : hasPending ? "bg-amber-50 text-warn" : "bg-paper text-muted"}`}
        >
          {label}
        </span>
      </div>
      <p className="text-sm text-muted">
        Do this once, while you are at home. Your admin approves it, and after that you can check in from home on your
        home days.
      </p>
      <button onClick={pin} disabled={busy} className="btn-ghost w-full">
        {busy ? "Getting your location…" : hasApproved || hasPending ? "Request a change (I’ve moved)" : "I’m at home — pin this location"}
      </button>
      {msg && <p className={`text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
    </div>
  );
}
