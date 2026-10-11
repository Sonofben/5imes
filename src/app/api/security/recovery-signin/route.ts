import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalise, verifyCode } from "@/lib/recoveryCodes";

/**
 * Trade a plaintext recovery code for an elevated session.
 *
 * - Requires a valid aal1 session (user has already signed in with password).
 * - Verifies the plaintext against the user's stored scrypt hashes.
 * - On success: marks that code as consumed, writes an audit event, and
 *   returns ok. The caller then does another aal1->aal2 round via a special
 *   "recovery" flow by re-issuing a fresh session with aal2 elevation; this
 *   is handled by the admin page: after we return ok, we tell the client
 *   that the next admin-page load will be allowed through the recovery
 *   gate (based on the audit event's recency).
 *
 * The gate itself is implemented in requireAdmin() — a recent
 * `recovery_used` event within the last 5 minutes lets the user through
 * without a TOTP challenge, so an admin whose phone was lost can still get
 * in. Each code is single-use and the window is short.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const candidate = typeof body?.code === "string" ? normalise(body.code) : "";
  if (!candidate || candidate.length < 8) return NextResponse.json({ error: "Enter a valid recovery code." }, { status: 400 });

  const { data: hashes } = await supabase.rpc("list_my_recovery_hashes");
  const rows = (hashes ?? []) as { id: string; code_hash: string }[];
  const match = rows.find((row) => verifyCode(candidate, row.code_hash));
  if (!match) return NextResponse.json({ error: "Recovery code is incorrect or already used." }, { status: 400 });

  const { data: consumed } = await supabase.rpc("consume_recovery_code", { p_id: match.id });
  if (!consumed) return NextResponse.json({ error: "Code could not be consumed; try again." }, { status: 500 });

  await supabase.rpc("log_security_event", { p_kind: "recovery_used", p_detail: {} });
  return NextResponse.json({ ok: true });
}
