import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateRecoveryCodes } from "@/lib/recoveryCodes";

/**
 * Generate a fresh batch of recovery codes for the signed-in user. The server
 * returns the plaintext codes ONCE (the response); only the scrypt hashes are
 * stored. Requires an aal2 session (two-factor already proved) so a stolen
 * password alone can't rotate recovery codes.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") {
    return NextResponse.json({ error: "Finish two-factor sign-in before generating recovery codes." }, { status: 403 });
  }

  const batch = generateRecoveryCodes();
  const { error } = await supabase.rpc("replace_recovery_codes", { p_hashes: batch.hashes });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await supabase.rpc("log_security_event", { p_kind: "recovery_regenerated", p_detail: { count: batch.codes.length } });
  return NextResponse.json({ codes: batch.codes });
}
