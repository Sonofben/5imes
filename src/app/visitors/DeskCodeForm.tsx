"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * "Visitor has a code?" — reception types the code from the visitor's email or waiting screen,
 * or scans their QR with this device's camera. Finding a visitor only opens their card; admitting
 * is a separate, deliberate tap.
 */
export function DeskCodeForm({ initial }: { initial: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initial);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);

  const open = useCallback((value: string) => {
    const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (clean.length >= 6) router.push(`/visitors?code=${encodeURIComponent(clean)}`);
  }, [router]);

  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null; let timer: ReturnType<typeof setInterval> | null = null; let stopped = false;
    type Detector = { detect: (s: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    if (!BD || !navigator.mediaDevices?.getUserMedia) { setCameraError("This browser can’t scan QR codes. Type the code instead."); setScanning(false); return; }
    const detector = new BD({ formats: ["qr_code"] });
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }).then((s) => {
      stream = s;
      if (video.current) { video.current.srcObject = s; void video.current.play(); }
      timer = setInterval(async () => {
        if (stopped || !video.current || video.current.readyState < 2) return;
        const found = await detector.detect(video.current).catch(() => []);
        const value = found[0]?.rawValue?.trim();
        if (value && /^[A-Za-z0-9 -]{6,20}$/.test(value)) { stopped = true; setScanning(false); setCode(value); open(value); }
      }, 350);
    }).catch(() => { setCameraError("The camera couldn’t start. Type the code instead."); setScanning(false); });
    return () => { stopped = true; if (timer) clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [scanning, open]);

  return (
    <form onSubmit={(e) => { e.preventDefault(); open(code); }} className="space-y-3">
      <label htmlFor="desk-code" className="sr-only">Visitor code</label>
      <input id="desk-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} autoComplete="off" autoCapitalize="characters"
        placeholder="ABCD 2345" className="input text-center font-mono text-2xl font-extrabold tracking-[0.2em]" />
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={code.replace(/[^A-Za-z0-9]/g, "").length < 6}>Find visitor</button>
        <button type="button" onClick={() => { setCameraError(null); setScanning((s) => !s); }} className="btn-ghost">{scanning ? "Stop camera" : "Scan QR"}</button>
      </div>
      {scanning && <video ref={video} playsInline muted className="mx-auto aspect-square w-full max-w-xs rounded-2xl bg-black object-cover" />}
      {cameraError && <p className="text-sm text-warn">{cameraError}</p>}
    </form>
  );
}
