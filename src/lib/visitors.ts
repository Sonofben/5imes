import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";
import { emailLayout, esc, sendEmail } from "./email.ts";
import { log } from "./log.ts";
import { siteUrl } from "./site.ts";
import { BrandShape, Invitation, parseOrNull, type Admission } from "./jsonShapes.ts";
import { brandTheme, type Brand } from "./brand.ts";
import { createHash } from "node:crypto";

export const PHOTO_BUCKET = "visitor-photos";

export function visitTime(iso: string | null | undefined, timezone: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-NG", { timeZone: timezone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** Email the visitor their invitation: when and where, their code, and the link they tap on arrival to check in. */
export async function sendVisitorInvite(p: {
  to: string; visitorName: string; orgName: string; hostName: string; officeName: string; address: string | null;
  lat: number | null; lng: number | null; expectedAt: string; timezone: string; code: string; passToken: string; purpose: string | null;
  brand?: Brand | null;
}) {
  const base = siteUrl();
  const theme = brandTheme(p.brand);
  const passUrl = `${base}/v/${encodeURIComponent(p.passToken)}`;
  const map = p.lat != null && p.lng != null ? `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}` : null;
  const when = visitTime(p.expectedAt, p.timezone);
  const shownCode = `${p.code.slice(0, 4)} ${p.code.slice(4)}`;
  const html = emailLayout(`You’re invited to ${p.orgName}`, `
    <p>Hello ${esc(p.visitorName)},</p>
    <p><b>${esc(p.hostName)}</b> has invited you to visit <b>${esc(p.orgName)}</b>.</p>
    <p style="margin:12px 0"><b>When:</b> ${esc(when)}<br><b>Where:</b> ${esc(p.officeName)}${p.address ? `<br>${esc(p.address)}` : ""}${p.purpose ? `<br><b>Purpose:</b> ${esc(p.purpose)}` : ""}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff5e8;border:1px solid #f3d9b5;border-radius:12px"><tr><td align="center" style="padding:16px">
      <p style="margin:0 0 8px;font-weight:bold">When you arrive, tap the button below. Your code is filled in for you.</p>
      <p style="margin:0 0 12px;font-size:24px;font-weight:800;letter-spacing:4px">${esc(shownCode)}</p>
      <a href="${passUrl}" style="display:inline-block;background:${theme.primary};color:${theme.onPrimary};padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">I’ve arrived — check in</a>
    </td></tr></table>
    ${map ? `<p style="text-align:center;margin-top:14px"><a href="${map}" style="color:${theme.branded ? theme.accentText : "#bd4528"}">Map and directions</a></p>` : ""}
    <p style="color:#68737a;font-size:12px">Keep this email private: the code lets you sign in as this visitor.</p>`,
    p.brand ? { logoUrl: p.brand.logo_url, name: p.orgName, accent: theme.branded ? theme.accent : null } : undefined);
  const text = `${p.hostName} has invited you to visit ${p.orgName}.\nWhen: ${when}\nWhere: ${p.officeName}${p.address ? `, ${p.address}` : ""}\nYour code: ${shownCode}\nWhen you arrive, check in here: ${passUrl}${map ? `\nMap: ${map}` : ""}`;
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
  if (!input.email) return { ok: true, msg: `${input.name} is invited. Give them their code: ${inv.data.code}.` };

  const [{ data: loc }, { data: visit }] = await Promise.all([
    supabase.from("locations").select("name,address,lat,lng").eq("id", input.location).maybeSingle(),
    supabase.from("visits").select("host_member_id").eq("id", inv.data.id).maybeSingle(),
  ]);
  let { data: host } = visit?.host_member_id
    ? await supabase.from("members").select("full_name,email").eq("id", visit.host_member_id).maybeSingle()
    : { data: null };
  if (!host && visit?.host_member_id) {
    // Reception staff can't read the staff table; the desk's host list gives them names.
    const { data: hosts } = await supabase.rpc("vms_hosts");
    const h = (hosts ?? []).find((x) => x.id === visit.host_member_id);
    if (h) host = { full_name: h.name, email: "" };
  }
  const { data: brandRaw } = await supabase.rpc("my_org_brand");
  const sent = await sendVisitorInvite({
    brand: parseOrNull(BrandShape, brandRaw, "visitors/invite.brand"),
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

/** Reasons a walk-in visitor can choose (the database accepts exactly these). */
export const VISIT_REASONS = [
  { id: "meeting", label: "Meeting" }, { id: "delivery", label: "Delivery" }, { id: "interview", label: "Interview" },
  { id: "contractor", label: "Contractor" }, { id: "other", label: "Other" },
] as const;
export function reasonLabel(id: string | null | undefined) {
  if (id === "invited") return "Invited";
  return VISIT_REASONS.find((r) => r.id === id)?.label ?? (id ? id : "—");
}

/**
 * A stable, anonymous key for the device sending a public form (for rate limits only): a hash of
 * the visitor's IP address as Nginx reports it, mixed with a server secret so it can't be reversed.
 */
export function clientKey(request: Request) {
  const ip = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const secret = process.env.FLASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createHash("sha256").update(`${secret}|${ip}`).digest("hex").slice(0, 32);
}

/** Email the host once their visitor is let in (no-op when the company turned alerts off). */
export async function alertHostAdmitted(result: Admission, timezone: string) {
  if (result.status !== "on_site" || !result.host_email || !result.visitor) return false;
  return sendHostAlert({
    to: result.host_email, hostName: result.host_name ?? "there", visitorName: result.visitor, company: result.company,
    officeName: result.location, at: result.signed_in_at ?? new Date().toISOString(), timezone,
  });
}

/** The office link printed as a QR code on the reception poster: "/visit/<company-slug>-<TOKEN>". */
export function visitorLinkUrl(orgSlug: string, token: string) {
  return `${siteUrl()}/visit/${encodeURIComponent(orgSlug)}-${token}`;
}
/** Only the token after the last "-" identifies the office; the company name is there for people. */
export function linkToken(link: string) {
  const token = decodeURIComponent(link).split("-").pop() ?? "";
  return /^[A-Za-z2-9]{10}$/.test(token) ? token.toUpperCase() : null;
}
