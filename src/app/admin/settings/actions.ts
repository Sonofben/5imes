"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/session";
import { flashQuery } from "@/lib/flash";
import { friendly } from "@/lib/errors";
import { throttle } from "@/lib/throttle";

function back(q: Record<string, string>): never {
  revalidatePath("/admin", "layout");
  redirect(`/admin/settings?${flashQuery(q)}`);
}

const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

function looksLike(ext: string, b: Uint8Array) {
  if (ext === "png") return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (ext === "jpg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (ext === "webp") return String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP";
  return false;
}

export async function saveBranding(formData: FormData) {
  const { org } = await requireMember({ admin: true });
  const supabase = await createClient();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const color = String(formData.get("brand_color") ?? "").trim();
  const accent = String(formData.get("accent_color") ?? "").trim();
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) back({ error: "Company link: 3–40 lowercase letters, numbers or dashes." });
  if ((color && !/^#[0-9a-fA-F]{6}$/.test(color)) || (accent && !/^#[0-9a-fA-F]{6}$/.test(accent))) back({ error: "Choose a valid colour." });

  // Colours are part of Pro and Premium; the database refuses them on other plans with a clear message.
  const update: { slug: string; brand_color: string | null; accent_color: string | null } = { slug, brand_color: color || null, accent_color: accent || null };
  // The logo link is set only by the server after an upload (admins cannot write it directly).
  let logoUrl: string | null | undefined;
  const file = formData.get("logo");
  if (formData.get("remove_logo") === "on") logoUrl = null;
  if (file instanceof File && file.size > 0) {
    const limited = await throttle(supabase, "logo_upload");
    if (limited) back({ error: limited });
    const ext = LOGO_TYPES[file.type];
    if (!ext) back({ error: "Logo must be PNG, JPG or WebP." });
    if (file.size > 1024 * 1024) back({ error: "Logo must be 1 MB or smaller." });
    // The browser's file type can be faked; check the file's first bytes too.
    if (!looksLike(ext, new Uint8Array(await file.slice(0, 12).arrayBuffer()))) back({ error: "That file isn’t a real PNG, JPG or WebP image." });
    const admin = createAdminClient();
    if (!admin) back({ error: "Logo upload is not configured on the server." });
    const { data: buckets } = await admin.storage.listBuckets();
    if (!buckets?.some((b) => b.name === "logos")) {
      await admin.storage.createBucket("logos", { public: true, fileSizeLimit: 1024 * 1024, allowedMimeTypes: Object.keys(LOGO_TYPES) });
    }
    const path = `${org.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await admin.storage.from("logos").upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) back({ error: friendly(uploadError, "admin/settings/upload", "Logo upload failed") });
    logoUrl = admin.storage.from("logos").getPublicUrl(path).data.publicUrl;
  }

  const { error } = await supabase.from("organizations").update(update).eq("id", org.id);
  if (error) back({ error: error.message.includes("organizations_slug_key") ? "That company link is already taken." : friendly(error, "admin/settings") });
  revalidatePath("/", "layout");
  if (logoUrl !== undefined) {
    const admin = createAdminClient();
    if (!admin) back({ error: "Logo upload is not configured on the server." });
    const { error: logoError } = await admin.from("organizations").update({ logo_url: logoUrl }).eq("id", org.id);
    if (logoError) back({ error: friendly(logoError, "admin/settings/logo") });
  }
  back({ msg: "Branding saved." });
}

export async function grantSupport(formData: FormData) {
  await requireMember({ admin: true });
  const supabase = await createClient();
  const { error } = await supabase.rpc("grant_support_access", { p_hours: Number(formData.get("hours")) });
  if (error) back({ error: friendly(error, "admin/settings") });
  back({ msg: "Support access granted. It switches off automatically." });
}

export async function revokeSupport() {
  await requireMember({ admin: true });
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_support_access");
  if (error) back({ error: friendly(error, "admin/settings") });
  back({ msg: "Support access turned off." });
}
