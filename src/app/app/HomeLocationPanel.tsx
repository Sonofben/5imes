"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getBestPosition, accuracyLabel, roughLocationMessage, ROUGH_ACCURACY_M } from "@/lib/geo";
import { reverseGeocode } from "@/lib/geocode";
import { friendly, UserError } from "@/lib/errors";

export function HomeLocationPanel({ status, hasApproved, hasPending }: { status: string; hasApproved: boolean; hasPending: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function pin() {
    setMsg(null);
    setBusy(true);
    try {
      const fix = await getBestPosition(15000, 20);
      if (fix.accuracy > ROUGH_ACCURACY_M) throw new UserError(roughLocationMessage(fix.accuracy));
      const address = await reverseGeocode(fix.lat, fix.lng);
      const { error } = await createClient().rpc("request_home_location", {
        p_lat: fix.lat,
        p_lng: fix.lng,
        p_accuracy: fix.accuracy,
        p_address: address ?? "",
      });
      if (error) throw new UserError(friendly(error, "app/home-location"));
      setMsg({ ok: true, text: `Sent for approval (accuracy ${accuracyLabel(fix.accuracy)}).` });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: friendly(e, "app/home-location", "Something went wrong") });
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
