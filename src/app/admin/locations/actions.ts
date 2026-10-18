"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { flashQuery } from "@/lib/flash";
import { friendly } from "@/lib/errors";
import { z } from "zod";
import { requireMember } from "@/lib/session";
import { latitude, longitude, officeRadius, parseForm } from "@/lib/schemas";

function back(params: Record<string, string>): never {
  revalidatePath("/admin/locations");
  redirect(`/admin/locations?${flashQuery(params)}`);
}

const NewOffice = z.object({
  name: z.string().trim().max(100, "Office name must be 100 characters or fewer.").transform((v) => v || "Office"),
  lat: latitude,
  lng: longitude,
  radius_m: officeRadius.default(200),
  address: z.string().trim().max(300).optional().transform((v) => v || null),
}).refine((o) => !(o.lat === 0 && o.lng === 0), { message: "Set the location first: search the address, use your current location, or tap the map." });

export async function addLocation(formData: FormData) {
  // The company always comes from the signed-in admin, never from the form.
  const { supabase, org } = await requireMember({ admin: true });
  const parsed = parseForm(NewOffice, formData);
  if (!parsed.ok) back({ error: /number|expected/i.test(parsed.error) ? "Set the location first: search the address, use your current location, or tap the map." : parsed.error });
  const { error } = await supabase.from("locations").insert({ org_id: org.id, ...parsed.data });
  if (error) back({ error: friendly(error, "admin/locations") });
  back({ msg: "Office added." });
}

export async function updateRadius(id: string, formData: FormData) {
  const { supabase } = await requireMember({ admin: true });
  const radius = officeRadius.safeParse(formData.get("radius_m"));
  if (!radius.success) back({ error: "Radius must be between 50 and 1000 metres." });
  const { error } = await supabase.from("locations").update({ radius_m: radius.data }).eq("id", id);
  if (error) back({ error: friendly(error, "admin/locations") });
  back({ msg: "Radius updated." });
}

export async function deleteLocation(id: string) {
  const { supabase } = await requireMember({ admin: true });
  const { error } = await supabase.from("locations").delete().eq("id", id);
  if (error) back({ error: friendly(error, "admin/locations") });
  back({ msg: "Office removed." });
}
