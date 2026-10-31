import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { VISIT_PHOTO_BUCKET } from "@/lib/field";

/** Open a visit photo: only the person, their line manager or an admin (row-level security) get a 60-second link. */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase.from("site_visits").select("photo_path").eq("id", id).maybeSingle();
  const admin = createAdminClient();
  if (!data?.photo_path || !admin) return new NextResponse("Not found", { status: 404 });
  const { data: signed } = await admin.storage.from(VISIT_PHOTO_BUCKET).createSignedUrl(data.photo_path, 60);
  if (!signed?.signedUrl) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(signed.signedUrl, 302);
}
