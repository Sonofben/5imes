import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { emailLayout, esc, sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site";
import { log } from "@/lib/log";

export const LEAVE_DOC_BUCKET = "leave-docs";
const DOC_TYPES: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };

/** "1 day", "2.5 days". */
export function fmtDays(n: number | null | undefined) {
  if (n == null) return "No limit";
  const v = Math.round(n * 10) / 10;
  return `${v} day${v === 1 ? "" : "s"}`;
}

export function fmtDate(d: string) {
  return new Intl.DateTimeFormat("en-NG", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
}

/**
 * Store a supporting document (doctor's note and the like) privately. Only the person, their line
 * manager and admins can open it, through a short-lived link. Returns the storage path.
 */
export async function uploadLeaveDoc(admin: SupabaseClient<Database>, orgId: string, memberId: string, file: File): Promise<string> {
  const ext = DOC_TYPES[file.type];
  if (!ext) throw new Error("Attach a PDF, JPG or PNG file.");
  if (file.size > 5 * 1024 * 1024) throw new Error("The document must be 5 MB or smaller.");
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const ok = ext === "pdf" ? head[0] === 0x25 && head[1] === 0x50 : ext === "png" ? head[0] === 0x89 && head[1] === 0x50 : head[0] === 0xff && head[1] === 0xd8;
  if (!ok) throw new Error("That file doesn't look like a real PDF, JPG or PNG.");
  const { data: buckets } = await admin.storage.listBuckets();
  if (!buckets?.some((b) => b.name === LEAVE_DOC_BUCKET)) {
    await admin.storage.createBucket(LEAVE_DOC_BUCKET, { public: false, fileSizeLimit: 5 * 1024 * 1024, allowedMimeTypes: Object.keys(DOC_TYPES) });
  }
  const path = `${orgId}/${memberId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage.from(LEAVE_DOC_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error("We couldn't upload the document. Try again.");
  return path;
}

/** Tell whoever decides (line manager, or the admins) that a request is waiting. */
export async function emailLeaveRequested(admin: SupabaseClient<Database> | null, requestId: string) {
  if (!admin) return;
  try {
    const { data: r } = await admin.from("leave_requests").select("org_id,member_id,approver_id,start_date,end_date,days,reason,status,leave_types(name)").eq("id", requestId).single();
    if (!r || r.status !== "pending") return;
    const [{ data: who }, { data: org }] = await Promise.all([
      admin.from("members").select("full_name,email").eq("id", r.member_id).single(),
      admin.from("organizations").select("name,logo_url,accent_color").eq("id", r.org_id).single(),
    ]);
    let to: { email: string }[] = [];
    if (r.approver_id) {
      const { data } = await admin.from("members").select("email").eq("id", r.approver_id).eq("status", "active");
      to = data ?? [];
    }
    if (!to.length) {
      const { data } = await admin.from("members").select("email").eq("org_id", r.org_id).eq("status", "active").in("role", ["owner", "admin"]);
      to = data ?? [];
    }
    const name = who?.full_name || who?.email || "Someone";
    const type = (r.leave_types as unknown as { name: string } | null)?.name ?? "Leave";
    const when = r.start_date === r.end_date ? fmtDate(r.start_date) : `${fmtDate(r.start_date)} to ${fmtDate(r.end_date)}`;
    const link = `${siteUrl()}/admin/leave`;
    const body = `<p><b>${esc(name)}</b> asked for <b>${esc(type)}</b>: ${esc(when)} (${esc(fmtDays(Number(r.days)))}).</p>${r.reason ? `<p>Reason: ${esc(r.reason)}</p>` : ""}<p><a href="${link}" style="display:inline-block;background:#182126;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700">Review the request</a></p>`;
    const brand = { logoUrl: org?.logo_url, name: org?.name, accent: org?.accent_color };
    for (const t of to.slice(0, 20)) {
      await sendEmail({ to: t.email, subject: `Leave request from ${name}`, html: emailLayout("A leave request is waiting for you", body, brand), text: `${name} asked for ${type}: ${when} (${fmtDays(Number(r.days))}). Review it at ${link}` });
    }
  } catch (error) {
    log.error("leave.email.requested", { message: error instanceof Error ? error.message : String(error) });
  }
}

/** Tell the person what was decided. */
export async function emailLeaveDecided(admin: SupabaseClient<Database> | null, requestId: string) {
  if (!admin) return;
  try {
    const { data: r } = await admin.from("leave_requests").select("org_id,member_id,start_date,end_date,days,status,decision_note,leave_types(name)").eq("id", requestId).single();
    if (!r || (r.status !== "approved" && r.status !== "declined")) return;
    const [{ data: who }, { data: org }] = await Promise.all([
      admin.from("members").select("email,full_name").eq("id", r.member_id).single(),
      admin.from("organizations").select("name,logo_url,accent_color").eq("id", r.org_id).single(),
    ]);
    if (!who?.email) return;
    const type = (r.leave_types as unknown as { name: string } | null)?.name ?? "Leave";
    const when = r.start_date === r.end_date ? fmtDate(r.start_date) : `${fmtDate(r.start_date)} to ${fmtDate(r.end_date)}`;
    const ok = r.status === "approved";
    const title = ok ? "Your leave is approved" : "Your leave request was declined";
    const body = `<p>${esc(type)}: ${esc(when)} (${esc(fmtDays(Number(r.days)))}).</p>${r.decision_note ? `<p>Note: ${esc(r.decision_note)}</p>` : ""}<p><a href="${siteUrl()}/app/leave">See your leave</a></p>`;
    await sendEmail({ to: who.email, subject: title, html: emailLayout(title, body, { logoUrl: org?.logo_url, name: org?.name, accent: org?.accent_color }), text: `${title}. ${type}: ${when}.${r.decision_note ? ` Note: ${r.decision_note}` : ""}` });
  } catch (error) {
    log.error("leave.email.decided", { message: error instanceof Error ? error.message : String(error) });
  }
}
