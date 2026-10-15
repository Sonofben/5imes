"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getBestPosition, type Fix } from "@/lib/geo";
import { reverseGeocode } from "@/lib/geocode";
import { MapView } from "@/components/maps/MapView";

export type ElsewhereRequest = {
  id: string; status: "pending" | "approved" | "rejected" | "cancelled"; requested_at: string; effective_from: string;
  lat: number; lng: number; radius_m: number; place_name: string | null; address: string | null; reason: string;
  decision_note: string | null; decided_at: string | null;
};

/** Staff: ask the line manager to work from a place that isn't the approved office/home. */
export function WorkElsewhere({ request, approverName, timezone }: { request: ElsewhereRequest | null; approverName: string; timezone: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const [address, setAddress] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const time = (iso: string) => new Intl.DateTimeFormat("en-NG", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(iso));

  async function locate() {
    setError(null); setBusy("Getting your location…");
    try {
      const f = await getBestPosition(15000, 25);
      setFix(f);
      setAddress((await reverseGeocode(f.lat, f.lng)) ?? "");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn’t get your location."); }
    finally { setBusy(null); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fix) return;
    setError(null); setBusy("Sending…");
    const { error } = await createClient().rpc("request_work_elsewhere", {
      p_lat: fix.lat, p_lng: fix.lng, p_accuracy: fix.accuracy, p_reason: reason, p_place_name: placeName, p_address: address,
    });
    setBusy(null);
    if (error) { setError(error.message); return; }
    setOpen(false); setFix(null); setReason(""); setPlaceName("");
    router.refresh();
  }

  async function cancel() {
    if (!request) return;
    setBusy("Cancelling…");
    const { error } = await createClient().rpc("cancel_work_elsewhere", { p_request: request.id });
    setBusy(null);
    if (error) setError(error.message); else router.refresh();
  }

  const place = request ? request.place_name || request.address || "the requested place" : "";

  return (
    <section id="work-elsewhere" aria-labelledby="we-heading" className="card mb-4 space-y-3">
      <div>
        <h2 id="we-heading" className="font-bold">Working somewhere else today?</h2>
        <p className="mt-1 text-sm text-muted">Ask {approverName} before you move. Your time keeps counting while they decide. If they say no, your day ends at the time you asked.</p>
      </div>

      {request?.status === "pending" && (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-warn">
          <p><b>Waiting for {approverName}</b> · asked at {time(request.requested_at)} to work at {place}.</p>
          <MapView height={150} label="Requested place" markers={[{ lat: request.lat, lng: request.lng, tone: "warn" }]} circles={[{ lat: request.lat, lng: request.lng, radius: request.radius_m, tone: "warn" }]} />
          <button type="button" className="btn-ghost btn-sm" onClick={cancel} disabled={!!busy}>Cancel request</button>
        </div>
      )}
      {request?.status === "approved" && (
        <div className="space-y-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-ok">
          <p><b>Approved</b> · you can work at {place} today. Check in and out there as usual.</p>
          <MapView height={150} label="Approved place" markers={[{ lat: request.lat, lng: request.lng, tone: "ok" }]} circles={[{ lat: request.lat, lng: request.lng, radius: request.radius_m, tone: "ok" }]} />
        </div>
      )}
      {request?.status === "rejected" && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-bad">
          <b>Not approved.</b> You were checked out at {time(request.effective_from)}, when you asked to move.
          {request.decision_note ? ` Note: “${request.decision_note}”` : ""}
        </p>
      )}

      {request?.status !== "pending" && !open && (
        <button type="button" className="btn-ghost w-full" onClick={() => { setOpen(true); void locate(); }}>Ask to work somewhere else</button>
      )}

      {open && (
        <form onSubmit={submit} className="space-y-3">
          {fix ? (
            <MapView height={180} label="Where you are now" markers={[{ lat: fix.lat, lng: fix.lng, tone: "brand", label: "You are here" }]} />
          ) : (
            <p className="text-sm text-muted">{busy ?? "We need your current location so your manager can see the place."}</p>
          )}
          {fix && <p className="text-xs text-muted">{address || "Address not found"} · ±{Math.round(fix.accuracy)} m</p>}
          <div>
            <label className="label" htmlFor="we-place">Place name (optional)</label>
            <input id="we-place" className="input" maxLength={120} value={placeName} onChange={(e) => setPlaceName(e.target.value)} placeholder="e.g. Client office, Ikeja" />
          </div>
          <div>
            <label className="label" htmlFor="we-reason">Why do you need to work here?</label>
            <textarea id="we-reason" className="input min-h-20" required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
          <div className="flex gap-2">
            <button className="btn-brand flex-1" disabled={!fix || !!busy}>{busy ?? `Send to ${approverName}`}</button>
            <button type="button" className="btn-ghost" onClick={() => { setOpen(false); setError(null); }}>Cancel</button>
            {!fix && !busy && <button type="button" className="btn-ghost" onClick={() => void locate()}>Retry location</button>}
          </div>
        </form>
      )}
      {!open && error && <p role="alert" className="text-sm text-bad">{error}</p>}
    </section>
  );
}
