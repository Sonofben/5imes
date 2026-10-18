import { NextResponse } from "next/server";
import { requireConsole } from "@/lib/console";
import { csvRow } from "@/lib/csv";
import { friendly } from "@/lib/errors";
import { throttle } from "@/lib/throttle";

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const { supabase } = await requireConsole();
  const limited = await throttle(supabase, "console_export");
  if (limited) return NextResponse.json({ error: limited }, { status: 429 });
  const { data, error } = await supabase.rpc("console_payments", {
    p_from: sp.get("from") || null, p_to: sp.get("to") || null, p_status: sp.get("status") || null, p_search: sp.get("q") || null,
  });
  if (error) return NextResponse.json({ error: friendly(error, "console/revenue/export") }, { status: 400 });
  const rows = (data ?? []).map((p) => [p.created_at, p.applied_at ?? "", p.company, p.domain, p.kind, p.plan, p.seats, p.months, p.provider, (p.amount_kobo / 100).toFixed(2), p.status, p.reference, p.note ?? ""]);
  const csv = [["Created", "Confirmed", "Company", "Domain", "Kind", "Plan", "Seats", "Months", "Provider", "Amount (NGN)", "Status", "Reference", "Note"], ...rows].map(csvRow).join("\r\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="5ime-payments-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
}
