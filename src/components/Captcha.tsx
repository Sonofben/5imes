"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile, used by Supabase Auth's CAPTCHA protection (sign-up, sign-in,
 * one-time codes, password reset). It runs in the background and only shows a
 * checkbox when Cloudflare is unsure, so most people never see it.
 *
 * Switched on by NEXT_PUBLIC_TURNSTILE_SITE_KEY. Without it, nothing is rendered and
 * no token is sent, which is correct while CAPTCHA protection is off in Supabase.
 *
 *   const captcha = useCaptcha();
 *   …<form>{captcha.slot}…</form>
 *   const captchaToken = await captcha.getToken();
 *   await supabase.auth.signUp({ …, options: { captchaToken } });
 *   captcha.reset();   // each token works once
 */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: Turnstile } }

let loading: Promise<Turnstile> | null = null;
function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT; s.async = true; s.defer = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile did not load")));
    s.onerror = () => { loading = null; reject(new Error("Turnstile did not load")); };
    document.head.appendChild(s);
  });
  return loading;
}

export function useCaptcha() {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const token = useRef<string | null>(null);
  const waiting = useRef<((t: string | undefined) => void)[]>([]);

  useEffect(() => {
    if (!SITE_KEY || !box.current) return;
    let cancelled = false;
    const settle = (t: string | undefined) => { const w = waiting.current; waiting.current = []; w.forEach((f) => f(t)); };
    loadTurnstile().then((ts) => {
      if (cancelled || !box.current) return;
      widget.current = ts.render(box.current, {
        sitekey: SITE_KEY,
        appearance: "interaction-only",
        callback: (t: string) => { token.current = t; settle(t); },
        "expired-callback": () => { token.current = null; },
        "error-callback": () => { token.current = null; settle(undefined); },
      });
    }).catch(() => settle(undefined));
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, []);

  /** Resolves with a token, or undefined if the check could not run (Supabase will then refuse). */
  const getToken = useCallback(async (): Promise<string | undefined> => {
    if (!SITE_KEY) return undefined;
    if (token.current) return token.current;
    return new Promise((resolve) => {
      waiting.current.push(resolve);
      setTimeout(() => resolve(token.current ?? undefined), 15000);
    });
  }, []);

  const reset = useCallback(() => {
    token.current = null;
    if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
  }, []);

  return { enabled: !!SITE_KEY, slot: SITE_KEY ? <div ref={box} className="flex justify-center empty:hidden" /> : null, getToken, reset };
}

/** Plain-language message for Supabase's CAPTCHA refusals. */
export function isCaptchaError(message: string | undefined) {
  return /captcha/i.test(message ?? "");
}
export const CAPTCHA_MESSAGE = "The security check didn’t complete. Refresh the page and try again.";
