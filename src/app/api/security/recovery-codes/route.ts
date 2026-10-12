import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateRecoveryCodes } from "@/lib/recoveryCodes";

/**
 * Generate a fresh batch of recovery codes for the signed-in user.
 *
 * Node generates the plaintext codes and hands them to the DB; the DB stores
 * only bcrypt hashes (via pgcrypto) and enforces aal2 internally. Returning
 * the plaintext here is the one and only time the user ever sees them.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") {
    return NextResponse.json({ error: "Finish two-factor sign-in before generating recovery codes." }, { status: 403 });
  }

  const { codes } = generateRecoveryCodes();
  const { error } = await supabase.rpc("replace_recovery_codes", { p_codes: codes });
  if (error) return NextResponse.json({ error: error.message }, { status: error.message.includes("aal2") ? 403 : 500 });

  return NextResponse.json({ codes });
}
