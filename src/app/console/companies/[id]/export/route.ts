import { NextResponse } from "next/server";
import { requireConsole } from "@/lib/console";
import { friendly } from "@/lib/errors";
import { throttle } from "@/lib/throttle";
import { ConsoleExportHead } from "@/lib/jsonShapes";

/** Download a company's data as JSON. Staff are included only while the company has granted support access. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reason = new URL(request.url).searchParams.get("reason") ?? "";
  const { supabase } = await requireConsole();
  const limited = await throttle(supabase, "console_export");
  if (limited) return NextResponse.json({ error: limited }, { status: 429 });
  const { data, error } = await supabase.rpc("console_company_export", { p_org: id, p_reason: reason });
  if (error) return NextResponse.json({ error: friendly(error, "console/companies/[id]/export") }, { status: 400 });
  const org = ConsoleExportHead.safeParse(data).data?.org;
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="5ime-${org?.domain ?? id}-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
