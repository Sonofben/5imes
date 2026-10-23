"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { flashQuery } from "@/lib/flash";
import { friendly } from "@/lib/errors";
import { parseForm } from "@/lib/schemas";
import { InviteForm } from "@/lib/visitorForms";
import { createInvitation, zonedIso } from "@/lib/visitors";

function back(params: Record<string, string>): never {
  revalidatePath("/app/visitors");
  redirect(`/app/visitors?${flashQuery(params)}`);
}

/** Staff invite visitors they will host themselves (the host field is ignored here). */
export async function inviteMyVisitor(formData: FormData) {
  const { supabase, org } = await requireMember();
  const parsed = parseForm(InviteForm, formData);
  if (!parsed.ok) back({ error: parsed.error });
  const expectedAt = zonedIso(parsed.data.date, parsed.data.time, org.timezone);
  if (!expectedAt) back({ error: "Choose the visit date and time." });
  const result = await createInvitation(supabase, org, { ...parsed.data, host: null, expectedAt });
  if (!result.ok) back({ error: friendly(result.error, "app/visitors/invite") });
  back({ msg: result.msg });
}

export async function cancelMyVisit(visitId: string) {
  const { supabase } = await requireMember();
  const { error } = await supabase.rpc("vms_cancel", { p_visit: visitId });
  if (error) back({ error: friendly(error, "app/visitors/cancel") });
  back({ msg: "Visit cancelled." });
}
