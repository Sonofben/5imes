import { NextResponse } from "next/server";
import { requireConsole } from "@/lib/console";
import { friendly } from "@/lib/errors";
import { throttle } from "@/lib/throttle";
import { ConsoleExportHead } from "@/lib/jsonShapes";
import { hasFreshStepUp, stepUpUrl } from "@/lib/stepUp";
import { siteUrl } from "@/lib/site";

/** Download a company's data as JSON. Staff are included only while the company has granted support access. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reason = new URL(request.url).searchParams.get("reason") ?? "";
  const { supabase } = await requireConsole();
  // Exports need a fresh code (the database checks it too, in console_company_export).
  if (!(await hasFreshStepUp(supabase))) {
    const here = new URL(request.url);
    return NextResponse.redirect(`${siteUrl(request)}${stepUpUrl(here.pathname + here.search)}`, { status: 303 });
  }
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
