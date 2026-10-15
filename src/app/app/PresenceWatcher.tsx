"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getBestPosition } from "@/lib/geo";

const EVERY_MS = 15 * 60_000;
type Presence = { status: string; departed_at?: string; request_status?: string | null };

/**
 * While the person is checked in and 5ime is open, re-check GPS every 15 minutes
 * (and whenever the app comes back to the screen). Leaving the approved place is
 * recorded once per session; the person is prompted to ask their line manager.
 * Phones do not let web apps check location while 5ime is closed.
 */
export function PresenceWatcher({ timezone }: { timezone: string }) {
  const [state, setState] = useState<Presence | null>(null);
  const last = useRef(0);

  useEffect(() => {
    let stopped = false;
    async function check() {
      if (stopped || document.visibilityState !== "visible" || Date.now() - last.current < EVERY_MS - 5_000) return;
      last.current = Date.now();
      try {
        const fix = await getBestPosition(10000, 50);
        const { data } = await createClient().rpc("report_presence", { p_lat: fix.lat, p_lng: fix.lng, p_accuracy: fix.accuracy });
        if (!stopped && data) setState(data as Presence);
      } catch {
        // No location this time (permission or signal). Try again on the next round.
      }
    }
    const first = setTimeout(check, 4_000);
    const timer = setInterval(check, 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; clearTimeout(first); clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  if (state?.status !== "outside" || state.request_status === "pending" || state.request_status === "approved") return null;
  const since = state.departed_at
    ? new Intl.DateTimeFormat("en-NG", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(state.departed_at))
    : null;
  return (
    <div role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-warn">
      <b>You seem to be away from your approved place{since ? ` (since ${since})` : ""}.</b> If you are working somewhere else,
      ask your line manager now. Otherwise your session may be ended at the time you left.{" "}
      <a href="#work-elsewhere" className="font-semibold underline">Ask to work here</a>
    </div>
  );
}
