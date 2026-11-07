import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChallengeForm } from "@/components/ChallengeForm";
import { safeNextPath } from "@/lib/safeNext";

export const metadata: Metadata = { title: "Confirm it’s you", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Step-up: a fresh authenticator code before a sensitive action (exports, deleting staff or a
 * company, billing changes, turning off or resetting two-step sign-in). Same screen as the sign-in
 * challenge; the code is checked on the server and then the person goes back to `next`.
 */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login");
  const sp = await searchParams;
  const next = safeNextPath(sp.next, "/admin");
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.totp?.find((f) => f.status === "verified");
  if (!totp) redirect("/admin/security?setup=1");
  // Finish ordinary two-step sign-in first; the challenge brings them back here.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") redirect(`/auth/challenge?next=${encodeURIComponent(`/auth/verify?next=${encodeURIComponent(next)}`)}`);
  return <ChallengeForm factorId={totp.id} next={next} stepUp />;
}
