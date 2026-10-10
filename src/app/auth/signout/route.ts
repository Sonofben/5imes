import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const base = siteUrl(request);
  return NextResponse.redirect(`${base}/login`, { status: 303 });
}
