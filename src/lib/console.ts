import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ConsoleRole = "owner" | "support" | "finance" | "viewer";

/**
 * Kora Forge console guard: must be signed in, listed in platform_staff, and on a
 * two-factor (aal2) session. Anyone else gets a plain 404 — the console is not advertised.
 */
export async function requireConsole(opts: { allowAal1?: boolean } = {}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: isStaff } = await supabase.rpc("is_console_staff");
  if (!isStaff) notFound();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2" && !opts.allowAal1) redirect("/console/mfa");
  const { data: role } = await supabase.rpc("console_role");
  return { supabase, user, role: (role ?? null) as ConsoleRole | null };
}

export const can = {
  trial: (r: ConsoleRole | null) => r === "owner" || r === "support",
  invite: (r: ConsoleRole | null) => r === "owner" || r === "support",
  staff: (r: ConsoleRole | null) => r === "owner" || r === "support",
  complimentary: (r: ConsoleRole | null) => r === "owner" || r === "finance",
  ownerOnly: (r: ConsoleRole | null) => r === "owner",
};

export const naira = (kobo: number | string) => "₦" + (Number(kobo) / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 });
export const fmtDate = (d?: string | null) => d ? new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium" }).format(new Date(d)) : "—";
export const fmtDateTime = (d?: string | null) => d ? new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" }).format(new Date(d)) : "—";
