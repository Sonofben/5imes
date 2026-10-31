import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { LEAVE_DOC_BUCKET } from "@/lib/leave";

/**
 * Open a leave document. The signed-in person must be able to see the request (row-level security:
 * the person, their line manager or an admin); then they get a link that works for 60 seconds.
 */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase.from("leave_requests").select("document_path").eq("id", id).maybeSingle();
  const admin = createAdminClient();
  if (!data?.document_path || !admin) return new NextResponse("Not found", { status: 404 });
  const { data: signed } = await admin.storage.from(LEAVE_DOC_BUCKET).createSignedUrl(data.document_path, 60);
  if (!signed?.signedUrl) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(signed.signedUrl, 302);
}
