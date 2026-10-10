import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const base = siteUrl(request);
  const code = searchParams.get("code");
  const errorDesc = searchParams.get("error_description");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${base}/start`);
    return NextResponse.redirect(`${base}/login?error=${encodeURIComponent(error.message)}`);
  }
  return NextResponse.redirect(`${base}/login?error=${encodeURIComponent(errorDesc || "Sign-in failed")}`);
}
