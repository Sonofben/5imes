import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { decodeJwtPayload } from "@/lib/session";
import { friendly } from "@/lib/errors";
import { throttle } from "@/lib/throttle";
import { log } from "@/lib/log";

const Body = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app.") });

/**
 * Step-up: prove a fresh authenticator code before a sensitive action.
 *
 * The code is checked here, on the server, by Supabase Auth (challenge + verify for the user's own
 * verified factor). Only when Supabase accepts it do we record the verification for this session
 * with the service role (public.record_step_up). The browser can't write that record itself, and
 * a code from another session doesn't count (see migration 0034).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const limited = await throttle(supabase, "step_up");
  if (limited) return NextResponse.json({ error: limited }, { status: 429 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Enter the 6-digit code." }, { status: 400 });

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.totp?.find((f) => f.status === "verified");
  if (!totp) return NextResponse.json({ error: "Set up two-step sign-in first." }, { status: 403 });

  const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: totp.id, code: parsed.data.code });
  if (verifyError) return NextResponse.json({ error: friendly(verifyError, "api/security/step-up") }, { status: 400 });

  // The session after verifying (its tokens are refreshed; the session id stays the same).
  const { data: session } = await supabase.auth.getSession();
  const sessionId = session.session?.access_token ? decodeJwtPayload(session.session.access_token)?.session_id : null;
  const admin = createAdminClient();
  if (!sessionId || !admin) {
    log.error("security.step_up", { reason: !admin ? "service role not configured" : "no session id" });
    return NextResponse.json({ error: "We couldn’t confirm the code. Please try again." }, { status: 500 });
  }
  const { error } = await admin.rpc("record_step_up", { p_user: user.id, p_session: sessionId });
  if (error) return NextResponse.json({ error: friendly(error, "api/security/step-up") }, { status: 500 });
  return NextResponse.json({ ok: true });
}
