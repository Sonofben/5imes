import Link from "next/link";
import { requireMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Flash } from "@/components/Flash";
import { SecuritySettings } from "./SecuritySettings";

export const dynamic = "force-dynamic";

type SecurityStatus = { totp_enrolled: boolean; unused_recovery_codes: number };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string; setup?: string }> }) {
  const sp = await searchParams;
  // allowAal1: admins must be able to reach this page BEFORE they finish MFA
  // setup, otherwise they can never enrol.
  const { member } = await requireMember({ admin: true, allowAal1: true });
  const supabase = await createClient();
  const { data: status } = await supabase.from("my_security_status").select("totp_enrolled, unused_recovery_codes").maybeSingle<SecurityStatus>();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const requiresMfa = member.role === "owner" || member.role === "admin";
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totpEnrolled = !!factors?.totp?.some((factor) => factor.status === "verified") || !!status?.totp_enrolled;
  const unusedCodes = status?.unused_recovery_codes ?? 0;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="eyebrow">Account security</p>
        <h1 className="page-heading">Password &amp; two-factor</h1>
        <p className="page-description">Your password protects day-to-day sign-in; two-factor stops someone with your password alone from reaching admin pages.</p>
        {totpEnrolled && <Link href="/admin" className="btn-ghost btn-sm mt-3">← Back to admin home</Link>}
      </div>
      <Flash msg={sp.msg} error={sp.error} />
      {sp.setup && requiresMfa && !totpEnrolled && (
        <p role="alert" className="rounded-xl border border-[#ead8c0] bg-[#fff9ef] px-4 py-3 text-sm text-ink">
          You can’t use admin tools yet — finish setting up two-factor below. It takes about a minute.
        </p>
      )}
      <SecuritySettings
        role={member.role}
        requiresMfa={requiresMfa}
        totpEnrolled={totpEnrolled}
        unusedCodes={unusedCodes}
        currentAal={aal?.currentLevel ?? null}
      />
    </div>
  );
}
