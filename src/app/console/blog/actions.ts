"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireConsoleAction } from "@/lib/console";
import { createAdminClient } from "@/lib/supabase/server";
import { flashQuery } from "@/lib/flash";
import { friendly } from "@/lib/errors";

const COVER_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
function looksLike(ext: string, b: Uint8Array) {
  if (ext === "png") return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (ext === "jpg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  return String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP";
}

const Faq = z.array(z.object({ q: z.string().trim().min(3).max(300), a: z.string().trim().min(3).max(2000) })).max(20);
const Post = z.object({
  title: z.string().trim().min(5, "Give the post a title (at least 5 characters).").max(140),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/, "Link: 3 to 80 lowercase letters, numbers and dashes."),
  excerpt: z.string().trim().max(320, "Summary: up to 320 characters."),
  body: z.string().max(80000),
  category: z.enum(["comparison", "guide", "product", "news"]),
  tags: z.string().max(400),
  author_name: z.string().trim().max(80),
  seo_title: z.string().trim().max(70, "Search title: up to 70 characters."),
  seo_description: z.string().trim().max(170, "Search description: up to 170 characters."),
  faq: z.string().max(60000),
  publish_at: z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Choose a valid date."),
});

export async function savePost(id: string | null, f: FormData) {
  const { supabase } = await requireConsoleAction();
  function back(q: Record<string, string>, to = id ?? "new"): never { redirect(`/console/blog/${to}?${flashQuery(q)}`); }
  const raw: Record<string, string> = {};
  for (const k of Object.keys(Post.shape)) raw[k] = String(f.get(k) ?? "");
  const parsed = Post.safeParse(raw);
  if (!parsed.success) back({ error: parsed.error.issues[0]?.message ?? "Some details aren’t valid." });
  const d = parsed.data;
  let faq: z.infer<typeof Faq> = [];
  try { faq = Faq.parse(JSON.parse(d.faq || "[]")); } catch { back({ error: "Each FAQ needs a question and an answer." }); }
  const publish = f.get("intent") === "publish";

  let cover: string | null | undefined;
  if (f.get("remove_cover") === "on") cover = null;
  const file = f.get("cover");
  if (file instanceof File && file.size > 0) {
    const ext = COVER_TYPES[file.type];
    if (!ext) back({ error: "Cover image must be PNG, JPG or WebP." });
    if (file.size > 2 * 1024 * 1024) back({ error: "Cover image must be 2 MB or smaller." });
    if (!looksLike(ext, new Uint8Array(await file.slice(0, 12).arrayBuffer()))) back({ error: "That file isn’t a real PNG, JPG or WebP image." });
    const admin = createAdminClient();
    if (!admin) back({ error: "Image upload is not configured on the server." });
    const { data: buckets } = await admin.storage.listBuckets();
    if (!buckets?.some((b) => b.name === "blog")) await admin.storage.createBucket("blog", { public: true, fileSizeLimit: 2 * 1024 * 1024, allowedMimeTypes: Object.keys(COVER_TYPES) });
    const path = `covers/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await admin.storage.from("blog").upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) back({ error: friendly(upErr, "console/blog/upload", "Image upload failed") });
    cover = admin.storage.from("blog").getPublicUrl(path).data.publicUrl;
  }

  const post: Record<string, unknown> = {
    title: d.title, slug: d.slug, excerpt: d.excerpt, body: d.body, category: d.category,
    tags: d.tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 12), author_name: d.author_name,
    seo_title: d.seo_title, seo_description: d.seo_description, faq,
  };
  if (cover !== undefined) post.cover_url = cover ?? "";
  const { data: savedId, error } = await supabase.rpc("console_save_post", {
    p_id: id as string, p_post: post as never, p_publish: publish,
    p_publish_at: publish && d.publish_at ? new Date(`${d.publish_at}T08:00:00+01:00`).toISOString() : undefined,
  });
  if (error) back({ error: friendly(error, "console/blog") });
  revalidatePath("/blog", "layout");
  revalidatePath("/console/blog");
  back({ msg: publish ? "Published." : "Draft saved." }, String(savedId));
}

export async function deletePost(id: string, f: FormData) {
  const { supabase } = await requireConsoleAction();
  const { error } = await supabase.rpc("console_delete_post", { p_id: id, p_reason: String(f.get("reason") ?? "") });
  if (error) redirect(`/console/blog/${id}?${flashQuery({ error: friendly(error, "console/blog") })}`);
  revalidatePath("/console/blog");
  redirect(`/console/blog?${flashQuery({ msg: "Post deleted." })}`);
}

export async function markEnquiry(id: string, handled: boolean) {
  const { supabase } = await requireConsoleAction();
  const { error } = await supabase.rpc("console_mark_enquiry", { p_id: id, p_handled: handled });
  revalidatePath("/console/enquiries");
  redirect(`/console/enquiries?${flashQuery(error ? { error: friendly(error, "console/enquiries") } : { msg: handled ? "Marked as handled." : "Marked as open." })}`);
}
