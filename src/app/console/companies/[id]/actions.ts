"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireConsoleAction } from "@/lib/console";
import { createAdminClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";
import { flashQuery } from "@/lib/flash";
import { friendly } from "@/lib/errors";

function back(id: string, q: Record<string, string>): never {
  revalidatePath(`/console/companies/${id}`);
  redirect(`/console/companies/${id}?${flashQuery(q)}`);
}
const reasonOf = (f: FormData) => String(f.get("reason") ?? "").trim();

export async function extendTrial(id: string, f: FormData) {
  const { supabase } = await requireConsoleAction();
  const { error } = await supabase.rpc("console_extend_trial", { p_org: id, p_days: Number(f.get("days")), p_reason: reasonOf(f) });
  back(id, error ? { error: friendly(error, "console/companies/[id]") } : { msg: "Trial extended." });
}

export async function grantComplimentary(id: string, f: FormData) {
  const { supabase } = await requireConsoleAction();
  const { error } = await supabase.rpc("console_grant_complimentary", {
    p_org: id, p_plan: String(f.get("plan")), p_seats: Number(f.get("seats")), p_months: Number(f.get("months")), p_reason: reasonOf(f),
  });
  back(id, error ? { error: friendly(error, "console/companies/[id]") } : { msg: "Complimentary term added." });
}

export async function invitePerson(id: string, f: FormData) {
  const { supabase } = await requireConsoleAction();
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const { error } = await supabase.rpc("console_invite_member", { p_org: id, p_email: email, p_name: String(f.get("name") ?? ""), p_reason: reasonOf(f) });
  if (error) back(id, { error: friendly(error, "console/companies/[id]") });
  const admin = createAdminClient();
  const sent = admin ? !(await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${siteUrl()}/auth/callback?type=invite` })).error : false;
  back(id, { msg: sent ? `${email} added and invite email sent.` : `${email} added. Ask them to sign in with that email.` });
}

export async function setSuspended(id: string, suspend: boolean, f: FormData) {
  const { supabase } = await requireConsoleAction();
  const { error } = await supabase.rpc("console_set_suspended", { p_org: id, p_suspend: suspend, p_reason: reasonOf(f) });
  back(id, error ? { error: friendly(error, "console/companies/[id]") } : { msg: suspend ? "Company suspended." : "Company reactivated." });
}

export async function transferOwner(id: string, f: FormData) {
  const { supabase } = await requireConsoleAction();
  const { error } = await supabase.rpc("console_transfer_ownership", { p_org: id, p_new_owner_email: String(f.get("email") ?? ""), p_reason: reasonOf(f) });
  back(id, error ? { error: friendly(error, "console/companies/[id]") } : { msg: "Ownership transferred." });
}

export async function changeDomain(id: string, f: FormData) {
  const { supabase } = await requireConsoleAction();
  const { error } = await supabase.rpc("console_update_domain", { p_org: id, p_domain: String(f.get("domain") ?? ""), p_reason: reasonOf(f) });
  back(id, error ? { error: friendly(error, "console/companies/[id]") } : { msg: "Email domain updated." });
}

export async function setPlan(id: string, f: FormData) {
  const { supabase } = await requireConsoleAction();
  const { error } = await supabase.rpc("console_set_plan", { p_org: id, p_plan: String(f.get("plan")), p_seats: Number(f.get("seats")), p_reason: reasonOf(f) });
  back(id, error ? { error: friendly(error, "console/companies/[id]") } : { msg: "Plan and seats updated." });
}

export async function setArchived(id: string, archived: boolean, f: FormData) {
  const { supabase } = await requireConsoleAction();
  const { error } = await supabase.rpc("console_set_archived", { p_org: id, p_archived: archived, p_reason: reasonOf(f) });
  back(id, error ? { error: friendly(error, "console/companies/[id]") } : { msg: archived ? "Company archived and suspended." : "Company restored from the archive (still suspended until you reactivate it)." });
}

export async function deleteCompany(id: string, f: FormData) {
  const { supabase } = await requireConsoleAction();
  const { error } = await supabase.rpc("console_delete_company", { p_org: id, p_confirm_domain: String(f.get("confirm") ?? ""), p_reason: reasonOf(f) });
  if (error) back(id, { error: friendly(error, "console/companies/[id]") });
  revalidatePath("/console/companies");
  redirect(`/console/companies?archived=1`);
}
