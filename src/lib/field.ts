import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export const VISIT_PHOTO_BUCKET = "visit-photos";

/** Store a visit photo privately (already shrunk in the browser). Returns the storage path. */
export async function uploadVisitPhoto(admin: SupabaseClient<Database>, orgId: string, memberId: string, file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 3 * 1024 * 1024) throw new Error("Use a JPG, PNG or WebP photo under 3 MB.");
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (!((head[0] === 0xff && head[1] === 0xd8) || head[0] === 0x89 || (head[0] === 0x52 && head[1] === 0x49))) throw new Error("That file isn't a real photo.");
  const { data: buckets } = await admin.storage.listBuckets();
  if (!buckets?.some((b) => b.name === VISIT_PHOTO_BUCKET)) {
    await admin.storage.createBucket(VISIT_PHOTO_BUCKET, { public: false, fileSizeLimit: 3 * 1024 * 1024, allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] });
  }
  const path = `${orgId}/${memberId}/${crypto.randomUUID()}.jpg`;
  const { error } = await admin.storage.from(VISIT_PHOTO_BUCKET).upload(path, file, { contentType: file.type });
  if (error) throw new Error("We couldn't save the photo. Try again.");
  return path;
}
