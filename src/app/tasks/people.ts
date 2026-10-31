import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/** People the signed-in person may give tasks to: themselves, their team (managers) or everyone (admins). */
export async function assignablePeople(supabase: SupabaseClient<Database>, orgId: string, meId: string, isAdmin: boolean) {
  const { data } = await supabase.from("members").select("id,full_name,email,team,line_manager_id").eq("org_id", orgId).eq("status", "active").order("full_name");
  return (data ?? []).filter((m) => isAdmin || m.id === meId || m.line_manager_id === meId)
    .map((m) => ({ id: m.id, name: m.full_name || m.email, team: m.team }));
}
