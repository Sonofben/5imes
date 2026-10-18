"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireConsole } from "@/lib/console";
import { createAdminClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";

export async function createCompany(f: FormData) {
  const { supabase } = await requireConsole();
  const email = String(f.get("owner_email") ?? "").trim().toLowerCase();
  const { data, error } = await supabase.rpc("console_create_company", {
    p_name: String(f.get("name") ?? ""), p_domain: String(f.get("domain") ?? ""), p_owner_email: email,
    p_owner_name: String(f.get("owner_name") ?? ""), p_trial_days: Number(f.get("trial_days") ?? 14), p_reason: String(f.get("reason") ?? ""),
  });
  if (error) redirect(`/console/companies?${new URLSearchParams({ error: error.message, new: "1" })}`);
  const admin = createAdminClient();
  const sent = admin ? !(await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${siteUrl()}/auth/callback?type=invite` })).error : false;
  revalidatePath("/console/companies");
  redirect(`/console/companies/${data}?${new URLSearchParams({ msg: sent ? `Company created. Invitation emailed to ${email}.` : `Company created. Ask ${email} to sign in or use "Forgot password" to set a password.` })}`);
}
