"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function back(params: Record<string, string>): never {
  revalidatePath("/admin/locations");
  redirect(`/admin/locations?${new URLSearchParams(params)}`);
}

export async function addLocation(orgId: string, formData: FormData) {
  const supabase = await createClient();
  const lat = Number(formData.get("lat"));
  const lng = Number(formData.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    back({ error: "Set the location first — tap “Use my current location” while at the office, or paste coordinates." });
  }
  const { error } = await supabase.from("locations").insert({
    org_id: orgId,
    name: String(formData.get("name") || "Office").trim(),
    lat,
    lng,
    radius_m: Number(formData.get("radius_m") || 200),
  });
  if (error) back({ error: error.message });
  back({ msg: "Office added." });
}

export async function updateRadius(id: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("locations").update({ radius_m: Number(formData.get("radius_m")) }).eq("id", id);
  if (error) back({ error: error.message });
  back({ msg: "Radius updated." });
}

export async function deleteLocation(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("locations").delete().eq("id", id);
  if (error) back({ error: error.message });
  back({ msg: "Office removed." });
}
