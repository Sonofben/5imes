import { NextResponse } from "next/server";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { passwordIssues } from "@/lib/password";

/**
 * Change the signed-in user's password without disturbing their session or MFA
 * level. We verify the current password against a throwaway supabase-js
 * client (so we don't overwrite the user's cookie-based session) and then
 * use the service role admin API to update it.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const current = typeof body?.current === "string" ? body.current : "";
  const next = typeof body?.next === "string" ? body.next : "";
  if (!current || !next) return NextResponse.json({ error: "Both current and new password are required." }, { status: 400 });
  const issues = passwordIssues(next);
  if (issues.length) return NextResponse.json({ error: issues[0] }, { status: 400 });

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user?.email) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const email = userRes.user.email;

  // Verify current password with a throwaway client that does NOT persist
  // sessions and does NOT touch the user's cookies.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  const probe = createPlainClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { error: verifyErr } = await probe.auth.signInWithPassword({ email, password: current });
  if (verifyErr) return NextResponse.json({ error: "Current password is wrong." }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role key is missing. Admin cannot change passwords." }, { status: 500 });
  const { error: updateErr } = await admin.auth.admin.updateUserById(userRes.user.id, { password: next });
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  await supabase.rpc("log_security_event", { p_kind: "password_changed", p_detail: {} });
  return NextResponse.json({ ok: true });
}
