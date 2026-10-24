import "server-only";
import { log } from "./log.ts";

/**
 * Emails the app sends itself (visitor invitations, host alerts) through Resend's HTTP API.
 * Sign-in emails still go through Supabase Auth's SMTP settings.
 *
 * Needs RESEND_API_KEY (the same Resend account Supabase uses is fine) and EMAIL_FROM,
 * for example: EMAIL_FROM=5ime <no-reply@koraforge.com.ng> (a sender on a verified Resend domain).
 * Without them, nothing is sent and callers are told so; the action itself still completes.
 */
export function emailEnabled() {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(p: { to: string; subject: string; html: string; text: string; replyTo?: string }): Promise<boolean> {
  if (!emailEnabled()) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [p.to], subject: (process.env.APP_ENV === "staging" ? "[Staging] " : "") + p.subject, html: p.html, text: p.text, reply_to: p.replyTo }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      log.error("email.send", { status: res.status, body: (await res.text().catch(() => "")).slice(0, 300) });
      return false;
    }
    return true;
  } catch (error) {
    log.error("email.send", { message: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

/** Escape text for HTML email bodies. */
export function esc(s: string | null | undefined) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** A plain, branded wrapper that renders well in Gmail and Outlook. */
export function emailLayout(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial,Helvetica,sans-serif;color:#182126">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e1e5e2">
<tr><td style="padding:24px 24px 8px;font-size:22px;font-weight:800"><span style="color:#e65b35">5</span>ime</td></tr>
<tr><td style="padding:0 24px 8px;font-size:18px;font-weight:700">${esc(title)}</td></tr>
<tr><td style="padding:0 24px 24px;font-size:14px;line-height:22px">${body}</td></tr>
</table>
<p style="font-size:11px;color:#68737a;margin:12px 0 0">Sent by 5ime, a Kora Forge product.</p>
</td></tr></table></body></html>`;
}
