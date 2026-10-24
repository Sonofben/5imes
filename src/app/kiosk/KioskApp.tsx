"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The reception tablet. One screen at a time, big touch targets, and it always returns to the
 * start screen on its own, so the next visitor never sees the previous visitor's details.
 */
type Ctx = { deviceName: string; timezone: string; orgName: string; logoUrl: string | null; brandColor: string | null; office: string; photoRequired: boolean; rulesText: string };
type Visit = { id: string; name: string; company?: string | null; host?: string | null };
type Host = { id: string; name: string; team: string | null };
type Badge = { visitor: string; company?: string | null; host?: string | null; office?: string | null; code?: string | null; signedInAt?: string | null };
type Walkin = { name: string; phone: string; email: string; company: string; purpose: string; host: Host | null };
type Screen =
  | { s: "home" } | { s: "scan" } | { s: "confirm"; visit: Visit } | { s: "walkin" }
  | { s: "rules"; visit?: Visit; walkin?: Walkin } | { s: "photo"; visit?: Visit; walkin?: Walkin }
  | { s: "badge"; badge: Badge } | { s: "denied" } | { s: "waiting"; name: string; code?: string | null } | { s: "signout" } | { s: "bye"; name: string };

const IDLE_MS = 90_000;
const EMPTY_WALKIN: Walkin = { name: "", phone: "", email: "", company: "", purpose: "", host: null };

export function KioskApp({ ctx }: { ctx: Ctx }) {
  const [screen, setScreen] = useState<Screen>({ s: "home" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const home = useCallback(() => { setError(null); setBusy(false); setScreen({ s: "home" }); }, []);

  // Back to the start after inactivity, and sooner after a finished visit.
  useEffect(() => {
    const reset = () => {
      if (idle.current) clearTimeout(idle.current);
      if (screen.s === "home") return;
      const ms = screen.s === "badge" ? 45_000 : screen.s === "bye" || screen.s === "denied" ? 10_000 : screen.s === "waiting" ? 20_000 : IDLE_MS;
      idle.current = setTimeout(home, ms);
    };
    reset();
    window.addEventListener("pointerdown", reset);
    window.addEventListener("keydown", reset);
    return () => { if (idle.current) clearTimeout(idle.current); window.removeEventListener("pointerdown", reset); window.removeEventListener("keydown", reset); };
  }, [screen, home]);

  async function call<T>(url: string, init: RequestInit): Promise<T | null> {
    setBusy(true); setError(null);
    try {
      const res = await fetch(url, init);
      const body = await res.json().catch(() => ({}));
      if (body?.unpaired) { window.location.reload(); return null; }
      if (!res.ok) { setError(body?.error ?? "Something went wrong. Please try again."); return null; }
      return body as T;
    } catch {
      setError("No connection. Check the tablet’s internet and try again.");
      return null;
    } finally { setBusy(false); }
  }

  async function findInvite(code: string) {
    const body = await call<{ visit: Visit & { status: string } }>("/api/kiosk/find", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    if (!body) return;
    if (body.visit.status === "on_site") { setError("You’re already signed in. To leave, choose “Sign out”."); return; }
    if (body.visit.status === "waiting") { setError("You’re already checked in. Please wait — reception will let you in."); return; }
    setScreen({ s: "confirm", visit: body.visit });
  }

  async function submit(target: { visit?: Visit; walkin?: Walkin }, photo: Blob | null) {
    const fd = new FormData();
    fd.set("rules", "yes");
    if (target.visit) fd.set("visit", target.visit.id);
    if (target.walkin) {
      const w = target.walkin;
      fd.set("name", w.name); fd.set("phone", w.phone); fd.set("email", w.email); fd.set("company", w.company); fd.set("purpose", w.purpose);
      if (w.host) fd.set("host", w.host.id);
    }
    if (photo) fd.set("photo", photo, "visitor.jpg");
    const body = await call<{ status: string } & Badge>("/api/kiosk/sign-in", { method: "POST", body: fd });
    if (!body) return;
    if (body.status === "denied") setScreen({ s: "denied" });
    else if (body.status === "waiting") setScreen({ s: "waiting", name: body.visitor, code: body.code });
    else setScreen({ s: "badge", badge: body });
  }

  const accent = ctx.brandColor ?? "#182126";
  return (
    <main className="flex min-h-screen flex-col bg-paper text-ink select-none">
      <style>{`@media print { body * { visibility: hidden !important; } .kiosk-badge, .kiosk-badge * { visibility: visible !important; } .kiosk-badge { position: fixed; inset: 0; margin: auto; width: 86mm; height: 54mm; box-shadow: none !important; } }`}</style>
      <header className="flex items-center justify-between px-6 py-4 text-white" style={{ background: accent }}>
        <div className="flex items-center gap-3">
          {ctx.logoUrl && <img src={ctx.logoUrl} alt="" className="h-10 w-auto rounded bg-white/95 p-1" />}
          <div><p className="text-lg font-bold leading-tight">{ctx.orgName}</p><p className="text-xs opacity-80">{ctx.office} · Visitor sign-in</p></div>
        </div>
        {screen.s === "home"
          ? <button onClick={() => document.documentElement.requestFullscreen?.().catch(() => undefined)} className="rounded-lg border border-white/40 px-3 py-1.5 text-xs">Full screen</button>
          : <button onClick={home} className="rounded-lg border border-white/40 px-4 py-2 text-sm font-semibold">Start again</button>}
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-8">
        {error && <p role="alert" className="mb-5 rounded-2xl bg-red-50 px-5 py-4 text-lg text-bad">{error}</p>}

        {screen.s === "home" && <div className="space-y-4">
          <h1 className="text-center text-3xl font-bold">Welcome to {ctx.orgName}</h1>
          <p className="text-center text-lg text-muted">Please sign in for your visit.</p>
          <Big onClick={() => setScreen({ s: "scan" })} accent>I have an invitation</Big>
          <Big onClick={() => setScreen({ s: "walkin" })}>I don’t have an invitation</Big>
          <Big onClick={() => setScreen({ s: "signout" })} quiet>Sign out (leaving)</Big>
        </div>}

        {screen.s === "scan" && <Scan busy={busy} onCode={findInvite} />}

        {screen.s === "confirm" && <div className="space-y-5 text-center">
          <h1 className="text-3xl font-bold">Welcome, {screen.visit.name}</h1>
          <p className="text-xl text-muted">You’re visiting <b className="text-ink">{screen.visit.host ?? "your host"}</b>.</p>
          <Big accent onClick={() => setScreen({ s: "rules", visit: screen.visit })}>That’s me — continue</Big>
          <Big quiet onClick={home}>That’s not me</Big>
        </div>}

        {screen.s === "walkin" && <WalkinForm onDone={(w) => setScreen({ s: "rules", walkin: w })} />}

        {screen.s === "rules" && <div className="space-y-5">
          <h1 className="text-2xl font-bold">Visitor rules</h1>
          <div className="max-h-[40vh] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-line bg-white p-5 text-lg leading-8">{ctx.rulesText}</div>
          <Big accent disabled={busy} onClick={() => ctx.photoRequired ? setScreen({ s: "photo", visit: screen.visit, walkin: screen.walkin }) : submit({ visit: screen.visit, walkin: screen.walkin }, null)}>
            {busy ? "Signing you in…" : "I accept — sign me in"}
          </Big>
        </div>}

        {screen.s === "photo" && <Photo busy={busy} onPhoto={(blob) => submit({ visit: screen.visit, walkin: screen.walkin }, blob)} />}

        {screen.s === "badge" && <div className="space-y-5">
          <p className="text-center text-2xl font-bold text-ok">You’re signed in{screen.badge.host ? `. We’ve let ${screen.badge.host} know you’re here.` : "."}</p>
          <div className="kiosk-badge mx-auto w-full max-w-sm rounded-2xl border-2 bg-white p-6 shadow-lg" style={{ borderColor: accent }}>
            <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: accent }}>Visitor · {ctx.orgName}</p>
            <p className="mt-3 text-3xl font-extrabold leading-tight">{screen.badge.visitor}</p>
            {screen.badge.company && <p className="text-lg text-muted">{screen.badge.company}</p>}
            <p className="mt-4 text-sm">Host: <b>{screen.badge.host ?? "—"}</b></p>
            <p className="text-sm">{screen.badge.office ?? ctx.office} · {new Date(screen.badge.signedInAt ?? Date.now()).toLocaleString("en-NG", { timeZone: ctx.timezone, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
            {screen.badge.code && <p className="mt-3 font-mono text-lg font-bold tracking-[0.25em]">{screen.badge.code}</p>}
          </div>
          <p className="text-center text-sm text-muted">Keep your code: you’ll use it to sign out.</p>
          <div className="grid grid-cols-2 gap-3"><Big onClick={() => window.print()}>Print badge</Big><Big accent onClick={home}>Done</Big></div>
        </div>}

        {screen.s === "denied" && <div className="space-y-5 text-center">
          <h1 className="text-3xl font-bold">Please speak to reception</h1>
          <p className="text-lg text-muted">We can’t complete your sign-in on this tablet.</p>
          <Big onClick={home}>OK</Big>
        </div>}

        {screen.s === "waiting" && <div className="space-y-5 text-center">
          <h1 className="text-3xl font-bold">Thanks, {screen.name.split(" ")[0]}. Please wait here.</h1>
          <p className="text-lg text-muted">Reception has your details and will let you in shortly.</p>
          {screen.code && <p className="font-mono text-3xl font-extrabold tracking-[0.18em]">{screen.code.slice(0, 4)} {screen.code.slice(4)}</p>}
          <Big onClick={home}>Done</Big>
        </div>}

        {screen.s === "signout" && <SignOut busy={busy} call={call} onDone={(name) => setScreen({ s: "bye", name })} />}

        {screen.s === "bye" && <div className="space-y-5 text-center">
          <h1 className="text-3xl font-bold">Goodbye{screen.name ? `, ${screen.name}` : ""}</h1>
          <p className="text-lg text-muted">You’re signed out. Thank you for visiting {ctx.orgName}.</p>
          <Big onClick={home}>Done</Big>
        </div>}
      </div>
    </main>
  );
}

function Big({ children, onClick, accent, quiet, disabled }: { children: React.ReactNode; onClick: () => void; accent?: boolean; quiet?: boolean; disabled?: boolean }) {
  return <button type="button" disabled={disabled} onClick={onClick}
    className={`w-full rounded-2xl px-6 py-5 text-xl font-semibold transition active:scale-[0.99] disabled:opacity-60 ${accent ? "bg-ink text-white" : quiet ? "border border-line bg-transparent text-muted" : "border border-line bg-white"}`}>{children}</button>;
}

/** Scan the QR code on the visitor's pass with the tablet camera, or type the code. */
function Scan({ busy, onCode }: { busy: boolean; onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [code, setCode] = useState("");
  const [camera, setCamera] = useState<"starting" | "on" | "off">("starting");
  const done = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null; let timer: ReturnType<typeof setInterval> | null = null;
    type Detector = { detect: (s: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    if (!BD || !navigator.mediaDevices?.getUserMedia) { setCamera("off"); return; }
    const detector = new BD({ formats: ["qr_code"] });
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }).then((s) => {
      stream = s;
      if (video.current) { video.current.srcObject = s; void video.current.play(); }
      setCamera("on");
      timer = setInterval(async () => {
        if (done.current || !video.current || video.current.readyState < 2) return;
        const found = await detector.detect(video.current).catch(() => []);
        const value = found[0]?.rawValue?.trim();
        if (value && /^[A-Za-z0-9-]{6,20}$/.test(value)) { done.current = true; onCode(value); setTimeout(() => { done.current = false; }, 3000); }
      }, 350);
    }).catch(() => setCamera("off"));
    return () => { if (timer) clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [onCode]);

  return <div className="space-y-5">
    <h1 className="text-center text-2xl font-bold">Show the QR code from your invitation</h1>
    {camera !== "off" && <video ref={video} playsInline muted className="mx-auto aspect-square w-full max-w-sm rounded-2xl bg-black object-cover" />}
    <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) onCode(code); }} className="space-y-3">
      <label className="block text-center text-lg text-muted" htmlFor="kiosk-code">{camera === "off" ? "Type the 8-character code from your invitation" : "…or type the code from your invitation"}</label>
      <input id="kiosk-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} autoComplete="off" autoCapitalize="characters"
        className="input text-center font-mono text-3xl tracking-[0.3em]" placeholder="ABCD2345" />
      <Big accent disabled={busy || code.trim().length < 6} onClick={() => onCode(code)}>{busy ? "Checking…" : "Continue"}</Big>
    </form>
  </div>;
}

function WalkinForm({ onDone }: { onDone: (w: Walkin) => void }) {
  const [w, setW] = useState<Walkin>(EMPTY_WALKIN);
  const [q, setQ] = useState("");
  const [hosts, setHosts] = useState<Host[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (w.host || q.trim().length < 2) { setHosts([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/kiosk/hosts?q=${encodeURIComponent(q.trim())}`).then((r) => r.json()).then((b) => setHosts(b?.hosts ?? [])).catch(() => setHosts([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q, w.host]);
  const set = (k: keyof Walkin) => (e: React.ChangeEvent<HTMLInputElement>) => setW({ ...w, [k]: e.target.value });
  function next() {
    if (w.name.trim().length < 2) return setProblem("Enter your full name.");
    if (!w.host) return setProblem("Choose who you are visiting.");
    if (w.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(w.email)) return setProblem("Check your email address, or leave it empty.");
    onDone(w);
  }
  return <div className="space-y-4">
    <h1 className="text-2xl font-bold">Tell us about your visit</h1>
    {problem && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-bad">{problem}</p>}
    <Field label="Full name *" value={w.name} onChange={set("name")} autoComplete="name" />
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Phone" value={w.phone} onChange={set("phone")} type="tel" autoComplete="tel" /><Field label="Email (optional)" value={w.email} onChange={set("email")} type="email" autoComplete="email" /></div>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Company" value={w.company} onChange={set("company")} /><Field label="Reason for visit" value={w.purpose} onChange={set("purpose")} /></div>
    <div>
      <label className="label text-base" htmlFor="kiosk-host">Who are you visiting? *</label>
      {w.host
        ? <div className="flex items-center justify-between rounded-xl border border-line bg-white px-4 py-3 text-lg"><span><b>{w.host.name}</b>{w.host.team ? ` · ${w.host.team}` : ""}</span><button type="button" className="text-sm underline" onClick={() => { setW({ ...w, host: null }); setQ(""); }}>Change</button></div>
        : <><input id="kiosk-host" className="input text-lg" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type their name" autoComplete="off" />
          {hosts.length > 0 && <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-white">{hosts.map((h) => <li key={h.id}><button type="button" className="w-full px-4 py-3 text-left text-lg" onClick={() => setW({ ...w, host: h })}><b>{h.name}</b>{h.team ? <span className="text-muted"> · {h.team}</span> : null}</button></li>)}</ul>}</>}
    </div>
    <Big accent onClick={next}>Continue</Big>
  </div>;
}

function Field({ label, ...p }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = `k-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return <div><label className="label text-base" htmlFor={id}>{label}</label><input id={id} className="input text-lg" maxLength={120} {...p} /></div>;
}

/** Take a visitor photo with the front camera (only when the company has switched photos on). */
function Photo({ busy, onPhoto }: { busy: boolean; onPhoto: (blob: Blob) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [shot, setShot] = useState<{ url: string; blob: Blob } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((s) => { stream = s; if (video.current) { video.current.srcObject = s; void video.current.play(); } })
      .catch(() => setProblem("The camera isn’t available. Please see reception."));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);
  function capture() {
    const v = video.current; if (!v || !v.videoWidth) return;
    const scale = Math.min(1, 640 / v.videoWidth);
    const c = document.createElement("canvas"); c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    c.toBlob((b) => { if (b) setShot({ url: URL.createObjectURL(b), blob: b }); }, "image/jpeg", 0.82);
  }
  return <div className="space-y-5 text-center">
    <h1 className="text-2xl font-bold">Take a quick photo for your visit</h1>
    {problem && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-bad">{problem}</p>}
    {shot ? <img src={shot.url} alt="Your photo" className="mx-auto aspect-square w-full max-w-sm rounded-2xl object-cover" />
      : <video ref={video} playsInline muted className="mx-auto aspect-square w-full max-w-sm -scale-x-100 rounded-2xl bg-black object-cover" />}
    {shot
      ? <div className="grid grid-cols-2 gap-3"><Big onClick={() => setShot(null)}>Retake</Big><Big accent disabled={busy} onClick={() => onPhoto(shot.blob)}>{busy ? "Signing you in…" : "Use this photo"}</Big></div>
      : <Big accent onClick={capture}>Take photo</Big>}
  </div>;
}

function SignOut({ busy, call, onDone }: { busy: boolean; call: <T>(url: string, init: RequestInit) => Promise<T | null>; onDone: (name: string) => void }) {
  const [list, setList] = useState<{ id: string; name: string }[] | null>(null);
  const [code, setCode] = useState("");
  useEffect(() => { fetch("/api/kiosk/on-site").then((r) => r.json()).then((b) => setList(b?.visitors ?? [])).catch(() => setList([])); }, []);
  async function out(payload: { visit?: string; code?: string }, name: string) {
    const body = await call<{ visitor: string }>("/api/kiosk/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (body) onDone((body.visitor || name).split(" ")[0]);
  }
  return <div className="space-y-5">
    <h1 className="text-2xl font-bold">Signing out</h1>
    <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) void out({ code }, ""); }} className="space-y-3">
      <label className="block text-lg text-muted" htmlFor="kiosk-out-code">Type the code on your badge or pass</label>
      <input id="kiosk-out-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} autoComplete="off"
        className="input text-center font-mono text-3xl tracking-[0.3em]" placeholder="ABCD2345" />
      <Big accent disabled={busy || code.trim().length < 6} onClick={() => void out({ code }, "")}>{busy ? "Signing out…" : "Sign out"}</Big>
    </form>
    {list && list.length > 0 && <div><p className="mb-2 text-lg text-muted">…or tap your name</p>
      <div className="grid gap-2 sm:grid-cols-2">{list.map((v) => <button key={v.id} type="button" disabled={busy} onClick={() => void out({ visit: v.id }, v.name)} className="rounded-xl border border-line bg-white px-4 py-4 text-left text-lg font-semibold">{v.name}</button>)}</div></div>}
  </div>;
}
