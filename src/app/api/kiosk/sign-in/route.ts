import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { kioskAdmin, kioskError, kioskToken, sameOrigin } from "@/lib/kiosk";
import { KioskContext, KioskSignIn, parseOrNull } from "@/lib/jsonShapes";
import { ensurePhotoBucket, PHOTO_BUCKET, sendHostAlert } from "@/lib/visitors";
import { log } from "@/lib/log";

const text = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const Form = z.object({
  visit: z.string().uuid().optional(),
  name: text(120),
  phone: text(30),
  email: z.string().trim().toLowerCase().max(254).email("Enter a valid email address, or leave it empty.").optional().or(z.literal("")).transform((v) => v || null),
  company: text(120),
  purpose: text(200),
  host: z.string().uuid().optional(),
  rules: z.literal("yes", { message: "Please read and accept the visitor rules." }),
});

/** Sign a visitor in at the reception tablet (invited or walk-in), with an optional photo. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const token = await kioskToken();
  if (!token) return NextResponse.json({ error: "This tablet is not set up.", unpaired: true }, { status: 401 });
  const admin = kioskAdmin();

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Something was missing. Please start again." }, { status: 400 });
  const raw: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") raw[k] = v;
  const parsed = Form.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Some details aren’t valid." }, { status: 400 });
  const f = parsed.data;

  const { data: ctxRaw, error: ctxError } = await admin.rpc("kiosk_context", { p_token: token });
  if (ctxError) return kioskError(ctxError, "sign-in/context");
  const ctx = parseOrNull(KioskContext, ctxRaw, "kiosk/sign-in");
  if (!ctx) return NextResponse.json({ error: "This tablet needs to be set up again." }, { status: 500 });

  // Optional photo: JPEG only, at most 2 MB, checked by its first bytes; stored privately under the company's folder.
  let photoPath: string | null = null;
  const photo = form.get("photo");
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > 2 * 1024 * 1024) return NextResponse.json({ error: "The photo is too large. Please try again." }, { status: 400 });
    const bytes = new Uint8Array(await photo.arrayBuffer());
    if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) return NextResponse.json({ error: "The photo didn’t save. Please try again." }, { status: 400 });
    await ensurePhotoBucket(admin);
    photoPath = `${ctx.org_id}/${randomUUID()}.jpg`;
    const { error: upError } = await admin.storage.from(PHOTO_BUCKET).upload(photoPath, bytes, { contentType: "image/jpeg", upsert: false });
    if (upError) { log.error("kiosk.photo", { message: upError.message }); return NextResponse.json({ error: "The photo didn’t save. Please try again." }, { status: 500 }); }
  }

  const { data, error } = await admin.rpc("kiosk_sign_in", {
    p_token: token, p_visit: f.visit ?? null, p_name: f.name, p_phone: f.phone, p_email: f.email, p_company: f.company,
    p_purpose: f.purpose, p_host: f.host ?? null, p_rules_accepted: true, p_photo_path: photoPath,
  });
  if (error) {
    if (photoPath) await admin.storage.from(PHOTO_BUCKET).remove([photoPath]);
    return kioskError(error, "sign-in");
  }
  const result = parseOrNull(KioskSignIn, data, "kiosk/sign-in");
  if (!result) return NextResponse.json({ error: "Something went wrong. Please see reception." }, { status: 500 });

  let hostEmailed = false;
  if (result.host_email) {
    hostEmailed = await sendHostAlert({
      to: result.host_email, hostName: result.host_name ?? "there", visitorName: result.visitor, company: result.company,
      officeName: result.location ?? ctx.location?.name, at: result.signed_in_at ?? new Date().toISOString(), timezone: ctx.org.timezone,
      denied: result.status === "denied",
    });
  }
  if (result.status === "denied") return NextResponse.json({ status: "denied" });
  return NextResponse.json({
    status: "on_site", visitor: result.visitor, company: result.company, host: result.host_name, office: result.location,
    code: result.code, signedInAt: result.signed_in_at, hostEmailed,
  });
}
