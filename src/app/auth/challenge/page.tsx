import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChallengeForm } from "@/components/ChallengeForm";

export const metadata: Metadata = { title: "Two-factor sign-in", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * aal1 → aal2 elevation. The user has signed in with a password; here they
 * prove their authenticator. If they can't, they can swap to a recovery code
 * (handled by the client component with /api/security/recovery-signin).
 */
export default async function ChallengePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login");
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") redirect("/admin");
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.totp?.find((f) => f.status === "verified");
  if (!totp) redirect("/admin/security?setup=1");
  const sp = await searchParams;
  return <ChallengeForm factorId={totp.id} next={safeNext(sp.next)} />;
}

/** Only same-site paths; never "//host" or absolute URLs (open-redirect guard). */
function safeNext(next?: string) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/admin";
}
