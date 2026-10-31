import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { TASK_FILE_BUCKET } from "@/lib/tasks";

/** Open a task file: only people who can see the task (row-level security) get a 60-second link. */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase.from("task_files").select("path,name").eq("id", id).maybeSingle();
  const admin = createAdminClient();
  if (!data || !admin) return new NextResponse("Not found", { status: 404 });
  const { data: signed } = await admin.storage.from(TASK_FILE_BUCKET).createSignedUrl(data.path, 60, { download: data.name });
  if (!signed?.signedUrl) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(signed.signedUrl, 302);
}
