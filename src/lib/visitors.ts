import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";
import { emailLayout, esc, sendEmail } from "./email.ts";
import { log } from "./log.ts";
import { siteUrl } from "./site.ts";
import { Invitation } from "./jsonShapes.ts";

export const PHOTO_BUCKET = "visitor-photos";

export function visitTime(iso: string | null | undefined, timezone: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-NG", { timeZone: timezone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** Email the visitor their pass: QR code, office address and map link. */
export async function sendVisitorInvite(p: {
  to: string; visitorName: string; orgName: string; hostName: string; officeName: string; address: string | null;
  lat: number | null; lng: number | null; expectedAt: string; timezone: string; code: string; passToken: string; purpose: string | null;
}) {
  const base = siteUrl();
  const passUrl = `${base}/v/${encodeURIComponent(p.passToken)}`;
  const qrUrl = `${base}/api/visit-qr?t=${encodeURIComponent(p.passToken)}`;
  const map = p.lat != null && p.lng != null ? `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}` : null;
  const when = visitTime(p.expectedAt, p.timezone);
  const html = emailLayout(`You’re invited to ${p.orgName}`, `
    <p>Hello ${esc(p.visitorName)},</p>
    <p><b>${esc(p.hostName)}</b> has invited you to visit <b>${esc(p.orgName)}</b>.</p>
    <p style="margin:12px 0"><b>When:</b> ${esc(when)}<br><b>Where:</b> ${esc(p.officeName)}${p.address ? `<br>${esc(p.address)}` : ""}${p.purpose ? `<br><b>Purpose:</b> ${esc(p.purpose)}` : ""}</p>
    <p>When you arrive, scan this code at the reception tablet, or type the code below it.</p>
    <p style="text-align:center;margin:16px 0"><img src="${qrUrl}" width="200" height="200" alt="Your visitor QR code" style="border:1px solid #e1e5e2;border-radius:12px"><br>
    <span style="font-size:22px;font-weight:800;letter-spacing:4px">${esc(p.code)}</span></p>
    <p style="text-align:center"><a href="${passUrl}" style="display:inline-block;background:#182126;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none">Open your visitor pass</a></p>
    ${map ? `<p style="text-align:center"><a href="${map}" style="color:#bd4528">Map and directions</a></p>` : ""}
    <p style="color:#68737a;font-size:12px">Keep this email private: the code lets you sign in as this visitor.</p>`);
  const text = `${p.hostName} has invited you to visit ${p.orgName}.\nWhen: ${when}\nWhere: ${p.officeName}${p.address ? `, ${p.address}` : ""}\nYour code at reception: ${p.code}\nYour pass: ${passUrl}${map ? `\nMap: ${map}` : ""}`;
  return sendEmail({ to: p.to, subject: `Your visit to ${p.orgName} — ${when}`, html, text });
}

/** Tell the host their visitor has arrived (or was refused at the tablet). */
export async function sendHostAlert(p: {
  to: string; hostName: string; visitorName: string; company?: string | null; officeName?: string | null; at: string; timezone: string; denied?: boolean;
}) {
  const when = visitTime(p.at, p.timezone);
  const who = `${p.visitorName}${p.company ? ` (${p.company})` : ""}`;
  const subject = p.denied ? `Visitor refused at reception: ${p.visitorName}` : `Your visitor has arrived: ${p.visitorName}`;
  const body = p.denied
    ? `<p>Hello ${esc(p.hostName)},</p><p><b>${esc(who)}</b> tried to sign in at ${esc(p.officeName ?? "reception")} at ${esc(when)} and was refused because they are on your company’s visitor blocklist.</p><p>Please speak to reception.</p>`
    : `<p>Hello ${esc(p.hostName)},</p><p><b>${esc(who)}</b> signed in at ${esc(p.officeName ?? "reception")} at ${esc(when)} and is waiting for you.</p>`;
  const text = p.denied
    ? `${who} tried to sign in at ${p.officeName ?? "reception"} at ${when} and was refused (visitor blocklist). Please speak to reception.`
    : `${who} signed in at ${p.officeName ?? "reception"} at ${when} and is waiting for you.`;
  return sendEmail({ to: p.to, subject, html: emailLayout(subject, body), text });
}

export async function ensurePhotoBucket(admin: SupabaseClient<Database>) {
  const { data } = await admin.storage.getBucket(PHOTO_BUCKET);
  if (data) return;
  await admin.storage.createBucket(PHOTO_BUCKET, { public: false, fileSizeLimit: 2 * 1024 * 1024, allowedMimeTypes: ["image/jpeg"] });
}

/** Signed links (5 minutes) to visitor photos, for admins viewing the visitor log. */
export async function photoLinks(admin: SupabaseClient<Database>, paths: string[]) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return new Map<string, string>();
  const { data } = await admin.storage.from(PHOTO_BUCKET).createSignedUrls(unique, 300);
  return new Map((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])));
}

let lastPurge = 0;
/**
 * Delete visitor details past each company's retention period (and their photos).
 * Runs at most every 10 minutes, triggered by visitor pages, so no separate scheduler is needed.
 */
export async function purgeExpiredVisitors(admin: SupabaseClient<Database>) {
  if (Date.now() - lastPurge < 10 * 60 * 1000) return;
  lastPurge = Date.now();
  const { data, error } = await admin.rpc("vms_purge_expired", { p_limit: 500 });
  if (error) { log.error("visitors.purge", { message: error.message }); return; }
  const paths = (data ?? []).map((r) => r.photo_path).filter((p): p is string => !!p);
  if (paths.length) {
    const { error: rmError } = await admin.storage.from(PHOTO_BUCKET).remove(paths);
    if (rmError) log.error("visitors.purge.photos", { message: rmError.message, count: paths.length });
  }
  if (paths.length || (data ?? []).length) log.info("visitors.purge", { photos: paths.length });
}

/**
 * Create an invitation (database checks Premium, host rules and limits) and email the visitor
 * their pass when an email address was given. Returns a message for the person who invited.
 */
export async function createInvitation(supabase: SupabaseClient<Database>, org: { id: string; name: string; timezone: string }, input: {
  location: string; name: string; email: string | null; phone: string | null; company: string | null; purpose: string | null;
  expectedAt: string; host: string | null;
}): Promise<{ ok: true; msg: string } | { ok: false; error: unknown }> {
  const { data, error } = await supabase.rpc("vms_invite", {
    p_location: input.location, p_name: input.name, p_email: input.email, p_phone: input.phone, p_company: input.company,
    p_purpose: input.purpose, p_expected_at: input.expectedAt, p_host: input.host,
  });
  if (error) return { ok: false, error };
  const inv = Invitation.safeParse(data);
  if (!inv.success) return { ok: false, error: new Error("Unexpected invitation result") };
  if (!input.email) return { ok: true, msg: `${input.name} is invited. Their code at the reception tablet is ${inv.data.code}.` };

  const [{ data: loc }, { data: visit }] = await Promise.all([
    supabase.from("locations").select("name,address,lat,lng").eq("id", input.location).maybeSingle(),
    supabase.from("visits").select("host_member_id").eq("id", inv.data.id).maybeSingle(),
  ]);
  const { data: host } = visit?.host_member_id
    ? await supabase.from("members").select("full_name,email").eq("id", visit.host_member_id).maybeSingle()
    : { data: null };
  const sent = await sendVisitorInvite({
    to: input.email, visitorName: input.name, orgName: org.name, hostName: host?.full_name || host?.email || "Your host",
    officeName: loc?.name ?? "our office", address: loc?.address ?? null, lat: loc?.lat ?? null, lng: loc?.lng ?? null,
    expectedAt: input.expectedAt, timezone: org.timezone, code: inv.data.code, passToken: inv.data.pass_token, purpose: input.purpose,
  });
  return { ok: true, msg: sent
    ? `Invitation emailed to ${input.email}. Their code is ${inv.data.code}.`
    : `${input.name} is invited (code ${inv.data.code}), but the email could not be sent. Give them the code, or ask an admin to check email settings.` };
}

/** Turn a date (YYYY-MM-DD) and time (HH:MM) in the company's time zone into an ISO timestamp. */
export function zonedIso(date: string, time: string, timezone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const asUtc = new Date(`${date}T${time}:00Z`);
  if (Number.isNaN(asUtc.getTime()) || asUtc.toISOString().slice(0, 10) !== date) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(asUtc).reduce<Record<string, string>>((a, p) => ({ ...a, [p.type]: p.value }), {});
  const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return new Date(asUtc.getTime() - (shown - asUtc.getTime())).toISOString();
}
