"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";
import { flashQuery } from "@/lib/flash";
import { friendly } from "@/lib/errors";
import { uuid } from "@/lib/schemas";
import { uploadVisitPhoto, VISIT_PHOTO_BUCKET } from "@/lib/field";

function back(q: Record<string, string>): never {
  revalidatePath("/app/field");
  redirect(`/app/field?${flashQuery(q)}`);
}
const n = (v: FormDataEntryValue | null) => { const x = Number(v); return v === null || v === "" || !Number.isFinite(x) ? null : x; };

export async function startVisit(f: FormData) {
  const { supabase } = await requireMember();
  const site = String(f.get("site") ?? "");
  if (!uuid.safeParse(site).success) back({ error: "Choose a client site." });
  const { error } = await supabase.rpc("start_visit", { p_site: site, p_lat: n(f.get("lat")) as number, p_lng: n(f.get("lng")) as number, p_accuracy: n(f.get("acc")) as number });
  if (error) back({ error: friendly(error, "field/start") });
  back({ msg: "Checked in. Don’t forget to check out when you leave." });
}

export async function endVisit(id: string, f: FormData) {
  const { supabase, me, org } = await requireMember();
  if (!uuid.safeParse(id).success) back({ error: "Unknown visit." });
  const admin = createAdminClient();
  const file = f.get("photo");
  let path: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (!admin) back({ error: "Photos can't be saved right now." });
    try { path = await uploadVisitPhoto(admin, org.id, me.id, file); } catch (e) { back({ error: e instanceof Error ? e.message : "Upload failed." }); }
  }
  const outcome = String(f.get("outcome") ?? "") || null;
  const { error } = await supabase.rpc("end_visit", {
    p_id: id, p_lat: n(f.get("lat")) as number, p_lng: n(f.get("lng")) as number, p_accuracy: n(f.get("acc")) as number,
    p_note: String(f.get("note") ?? ""), p_outcome: outcome as string, p_photo: path as string,
  });
  if (error) {
    if (path && admin) await admin.storage.from(VISIT_PHOTO_BUCKET).remove([path]);
    back({ error: friendly(error, "field/end") });
  }
  back({ msg: "Visit saved. Well done!" });
}
