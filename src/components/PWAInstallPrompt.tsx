"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
};
type InstallKind = "ios" | "mac-safari" | null;

const DISMISSED_KEY = "5ime:pwa-install-dismissed";

function wasDismissed() {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissal() {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // The prompt can still be dismissed for this render if storage is unavailable.
  }
}

export function PWAInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installKind, setInstallKind] = useState<InstallKind>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    const secureContext = window.location.protocol === "https:" || window.location.hostname === "localhost";
    if ("serviceWorker" in navigator && secureContext) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }

    const nav = navigator as Navigator & { standalone?: boolean };
    const alreadyInstalled = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    if (alreadyInstalled) return;

    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const macSafari = /Macintosh/i.test(ua) && /Safari/i.test(ua) && !/(Chrome|Chromium|Edg)/i.test(ua);
    setInstallKind(ios ? "ios" : macSafari ? "mac-safari" : null);
    setDismissed(wasDismissed());

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onAppInstalled = () => {
      setInstallPrompt(null);
      setDismissed(true);
      rememberDismissal();
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (dismissed || (!installPrompt && !installKind)) return null;

  const isAppleGuide = installKind !== null;
  const heading = installKind === "ios" ? "Add 5ime to your Home Screen" : "Install 5ime";
  const guidance = installKind === "ios"
    ? "In Safari, tap Share, choose “Add to Home Screen”, then tap Add."
    : "In Safari, open the File menu and choose “Add to Dock”.";

  async function installOrShowInstructions() {
    if (isAppleGuide) {
      setShowInstructions((visible) => !visible);
      return;
    }
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") {
      setDismissed(true);
      rememberDismissal();
    }
  }

  function dismiss() {
    setDismissed(true);
    rememberDismissal();
  }

  return (
    <aside
      aria-label="Install 5ime"
      className="fixed inset-x-3 z-50 mx-auto max-w-lg rounded-2xl border border-line bg-white p-4 shadow-[0_16px_48px_rgba(24,33,38,0.18)] sm:left-auto sm:right-5 sm:w-[min(28rem,calc(100vw-2.5rem))]"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink text-base font-black text-[#ff5a1f]">5</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{heading}</p>
          <p className="mt-0.5 text-xs leading-5 text-muted">
            {installKind === "ios" ? "Keep work check-ins one tap away on your iPhone." : installKind === "mac-safari" ? "Keep 5ime in your Dock for quick access." : "Install the app for quick access from your device."}
          </p>
        </div>
        <button type="button" onClick={dismiss} aria-label="Dismiss install prompt" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xl leading-none text-muted hover:bg-paper">×</button>
      </div>
      <div className="mt-3 flex justify-end">
        <button type="button" onClick={installOrShowInstructions} className="btn-brand btn-sm">
          {isAppleGuide ? (showInstructions ? "Hide instructions" : "How to install") : "Install app"}
        </button>
      </div>
      {showInstructions && <p role="status" className="mt-3 rounded-xl bg-paper px-3 py-2.5 text-xs leading-5 text-ink">{guidance}</p>}
    </aside>
  );
}
