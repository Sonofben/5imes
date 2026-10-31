"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";
import { flashQuery } from "@/lib/flash";
import { friendly } from "@/lib/errors";
import { uuid } from "@/lib/schemas";

function back(q: Record<string, string>): never {
  revalidatePath("/app", "layout");
  redirect(`/app/profile?${flashQuery(q)}`);
}

export async function sendWish(celebrant: string, f: FormData): Promise<{ ok: boolean; error?: string }> {
  const { supabase } = await requireMember();
  if (!uuid.safeParse(celebrant).success) return { ok: false, error: "Unknown person." };
  const { error } = await supabase.rpc("send_wish", { p_celebrant: celebrant, p_message: String(f.get("message") ?? "") });
  if (error) return { ok: false, error: friendly(error, "app/wish") };
  return { ok: true };
}

export async function saveBirthday(f: FormData) {
  const { supabase } = await requireMember();
  const month = Number(f.get("month") || 0), day = Number(f.get("day") || 0);
  const has = month > 0 && day > 0;
  const { error } = await supabase.rpc("set_my_birthday", { p_month: has ? month : null, p_day: has ? day : null, p_opt_out: f.get("opt_out") === "on" });
  if (error) back({ error: friendly(error, "app/birthday") });
  back({ msg: "Saved." });
}

const AVATAR_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Profile picture: square-cropped and shrunk in the browser first; checked again here. */
export async function saveAvatar(f: FormData) {
  const { me } = await requireMember();
  const admin = createAdminClient();
  if (!admin) back({ error: "Pictures can't be saved right now." });
  if (f.get("remove") === "on") {
    await admin.rpc("set_member_avatar", { p_member: me.id, p_url: null as unknown as string });
    back({ msg: "Picture removed." });
  }
  const file = f.get("photo");
  if (!(file instanceof File) || file.size === 0) back({ error: "Choose a picture." });
  const ext = AVATAR_TYPES[file.type];
  if (!ext || file.size > 1024 * 1024) back({ error: "Use a PNG, JPG or WebP picture under 1 MB." });
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const real = ext === "png" ? head[0] === 0x89 : ext === "jpg" ? head[0] === 0xff && head[1] === 0xd8 : head[8] === 0x57 && head[9] === 0x45;
  if (!real) back({ error: "That file isn't a real picture." });
  const { data: buckets } = await admin.storage.listBuckets();
  if (!buckets?.some((b) => b.name === "avatars")) await admin.storage.createBucket("avatars", { public: true, fileSizeLimit: 1024 * 1024, allowedMimeTypes: Object.keys(AVATAR_TYPES) });
  const path = `${me.org_id}/${me.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage.from("avatars").upload(path, file, { contentType: file.type });
  if (error) back({ error: "We couldn't save the picture. Try again." });
  const url = admin.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  const { error: setError } = await admin.rpc("set_member_avatar", { p_member: me.id, p_url: url });
  if (setError) back({ error: friendly(setError, "app/avatar") });
  back({ msg: "Picture saved." });
}
