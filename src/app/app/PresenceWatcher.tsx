"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getBestPosition } from "@/lib/geo";
import { Presence } from "@/lib/jsonShapes";

/**
 * While 5ime is open on a working day, check GPS now and then (and whenever the app comes back to
 * the screen) and tell the server whether the person is at their approved place. The server keeps
 * only the time and the kind of place, never the coordinates. This drives:
 *  - automatic check-in (the time they first arrived), once they've earned it;
 *  - closing time: checked out automatically, or a reminder when overtime is allowed;
 *  - leaving the approved place during the day (they're asked to tell their line manager).
 * Phones do not let web apps check location while 5ime is closed.
 */
export function PresenceWatcher({ timezone, checkedIn }: { timezone: string; checkedIn: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<Presence | null>(null);
  const last = useRef(0);
  const every = checkedIn ? 15 * 60_000 : 5 * 60_000;

  useEffect(() => {
    let stopped = false;
    async function check() {
      if (stopped || document.visibilityState !== "visible" || Date.now() - last.current < every - 5_000) return;
      last.current = Date.now();
      try {
        const fix = await getBestPosition(10000, 50);
        const { data } = await createClient().rpc("report_presence", { p_lat: fix.lat, p_lng: fix.lng, p_accuracy: fix.accuracy });
        const presence = Presence.safeParse(data);
        if (stopped || !presence.success) return;
        setState(presence.data);
        if (presence.data.status === "auto_checked_in" || presence.data.status === "auto_checked_out") router.refresh();
      } catch {
        // No location this time (permission or signal). Try again on the next round.
      }
    }
    const first = setTimeout(check, 4_000);
    const timer = setInterval(check, 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; clearTimeout(first); clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [every, router]);

  if (state?.closing) {
    return (
      <div role="status" className="mb-4 rounded-xl border border-[#c8dfd1] bg-[#f1f8f3] p-3 text-sm text-[#245c3e]">
        <b>It’s closing time.</b> If you’re staying on, your overtime is counted. Check out when you finish — if you leave without checking out, 5ime checks you out at the time you left.
      </div>
    );
  }
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
