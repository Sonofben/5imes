"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/session";

function back(q: Record<string, string>): never {
  revalidatePath("/admin", "layout");
  redirect(`/admin/settings?${new URLSearchParams(q)}`);
}

const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export async function saveBranding(formData: FormData) {
  const { org } = await requireMember({ admin: true });
  const supabase = await createClient();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const color = String(formData.get("brand_color") ?? "").trim();
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) back({ error: "Company link: 3–40 lowercase letters, numbers or dashes." });
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) back({ error: "Choose a valid colour." });

  const update: { slug: string; brand_color: string | null; logo_url?: string | null } = { slug, brand_color: color || null };
  const file = formData.get("logo");
  if (formData.get("remove_logo") === "on") update.logo_url = null;
  if (file instanceof File && file.size > 0) {
    const ext = LOGO_TYPES[file.type];
    if (!ext) back({ error: "Logo must be PNG, JPG or WebP." });
    if (file.size > 1024 * 1024) back({ error: "Logo must be 1 MB or smaller." });
    const admin = createAdminClient();
    if (!admin) back({ error: "Logo upload is not configured on the server." });
    const { data: buckets } = await admin.storage.listBuckets();
    if (!buckets?.some((b) => b.name === "logos")) {
      await admin.storage.createBucket("logos", { public: true, fileSizeLimit: 1024 * 1024, allowedMimeTypes: Object.keys(LOGO_TYPES) });
    }
    const path = `${org.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await admin.storage.from("logos").upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) back({ error: `Logo upload failed: ${uploadError.message}` });
    update.logo_url = admin.storage.from("logos").getPublicUrl(path).data.publicUrl;
  }

  const { error } = await supabase.from("organizations").update(update).eq("id", org.id);
  if (error) back({ error: error.message.includes("organizations_slug_key") ? "That company link is already taken." : error.message });
  back({ msg: "Branding saved." });
}

export async function grantSupport(formData: FormData) {
  await requireMember({ admin: true });
  const supabase = await createClient();
  const { error } = await supabase.rpc("grant_support_access", { p_hours: Number(formData.get("hours")) });
  if (error) back({ error: error.message });
  back({ msg: "Support access granted. It switches off automatically." });
}

export async function revokeSupport() {
  await requireMember({ admin: true });
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_support_access");
  if (error) back({ error: error.message });
  back({ msg: "Support access turned off." });
}
