import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { throttle } from "@/lib/throttle";
import { flashQuery } from "@/lib/flash";

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

/** requireConsole for actions that change something: also applies the Global Admin action limit. */
export async function requireConsoleAction() {
  const ctx = await requireConsole();
  const limited = await throttle(ctx.supabase, "console_action");
  if (limited) redirect(`/console?${flashQuery({ error: limited })}`);
  return ctx;
}

/** What each Global Admin role is called on screen. */
export const ROLE_LABELS: Record<ConsoleRole, string> = {
  owner: "Global admin",
  support: "Support admin",
  finance: "Billing admin",
  viewer: "Read-only admin",
};
export const ROLE_HELP: Record<ConsoleRole, string> = {
  owner: "Everything, including prices, the team and deleting companies.",
  support: "Companies, people, security and announcements.",
  finance: "Revenue, payments, plans and seats, complimentary terms.",
  viewer: "Can look at everything, change nothing.",
};

const any = (...roles: ConsoleRole[]) => (r: ConsoleRole | null) => !!r && roles.includes(r);
export const can = {
  trial: any("owner", "support"),
  invite: any("owner", "support"),
  staff: any("owner", "support"),
  viewAs: any("owner", "support"),
  complimentary: any("owner", "finance"),
  setPlan: any("owner", "finance"),
  createCompany: any("owner", "support"),
  archive: any("owner", "support"),
  export: any("owner", "support", "finance"),
  people: any("owner", "support"),
  announce: any("owner", "support"),
  ownerOnly: any("owner"),
};

export const naira = (kobo: number | string) => "₦" + (Number(kobo) / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 });
export const fmtDate = (d?: string | null) => d ? new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium" }).format(new Date(d)) : "—";
export const fmtDateTime = (d?: string | null) => d ? new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" }).format(new Date(d)) : "—";
