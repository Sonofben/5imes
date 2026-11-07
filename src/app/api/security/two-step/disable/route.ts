import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { friendly } from "@/lib/errors";
import { hasFreshStepUp, stepUpUrl } from "@/lib/stepUp";

/**
 * Turn off two-step sign-in for the signed-in user. Needs a fresh authenticator code first (step-up);
 * without one the reply says where to go to type it. The factors are removed with the user's own
 * session (Supabase Auth also requires aal2 for this).
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (!(await hasFreshStepUp(supabase))) {
    return NextResponse.json({ error: "Enter a fresh code from your authenticator app first.", stepUp: stepUpUrl("/admin/security") }, { status: 403 });
  }
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return NextResponse.json({ error: friendly(listError, "api/security/two-step/disable") }, { status: 400 });
  for (const factor of factors?.all ?? []) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (error) return NextResponse.json({ error: friendly(error, "api/security/two-step/disable") }, { status: 400 });
  }
  await supabase.rpc("log_security_event", { p_kind: "totp_disabled", p_detail: {} });
  return NextResponse.json({ ok: true });
}
