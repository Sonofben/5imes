import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Trade a plaintext recovery code for an AAL1 grace window.
 *
 * All verification and consumption happens inside the DB via
 * `verify_and_consume_recovery_code`:
 *
 *   - It bcrypt-compares the normalised plaintext against the user's unused
 *     stored hashes.
 *   - If a hash matches, it marks that specific code consumed in the same
 *     statement and writes a `recovery_used` audit event bound to the
 *     current `session_id`.
 *   - On an invalid, replayed, or someone-else's code, it returns `false`
 *     and never writes any audit row.
 *
 * The grace window itself is enforced in `requireMember()`: the next
 * admin-page load reads `member_security_events` for a `recovery_used` row
 * tied to this exact session within the configured window, and lets the
 * user through on aal1 so they can re-enrol TOTP.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const code = typeof body?.code === "string" ? body.code : "";
  if (!code || code.replace(/[^A-Za-z0-9]/g, "").length < 8) {
    return NextResponse.json({ error: "Enter a valid recovery code." }, { status: 400 });
  }

  const { data: ok, error } = await supabase.rpc("verify_and_consume_recovery_code", { p_code: code });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (ok !== true) {
    return NextResponse.json({ error: "Recovery code is incorrect or already used." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
