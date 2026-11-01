import { requireConsole, can, fmtDateTime } from "@/lib/console";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { friendly } from "@/lib/errors";
import { markEnquiry } from "../blog/actions";

export const dynamic = "force-dynamic";

export default async function Enquiries({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const flash = readFlash(await searchParams);
  const { supabase, role } = await requireConsole();
  if (!can.enquiries(role)) return <p className="card">Your role cannot open sales enquiries.</p>;
  const { data, error } = await supabase.rpc("console_sales_enquiries");
  const rows = data ?? [];
  return (
    <div className="space-y-4">
      <div><h1 className="page-heading">Sales enquiries</h1><p className="text-sm text-muted">Messages from the Talk to sales form. Each one is also emailed to the sales mailbox. Removed automatically after two years.</p></div>
      <Flash {...flash} />
      {error && <p className="card text-bad">{friendly(error, "console/enquiries")}</p>}
      {rows.length === 0 ? <p className="card text-muted">No enquiries yet.</p> : rows.map((r) => (
        <article key={r.id} className={`card space-y-2 ${r.handled_at ? "opacity-60" : ""}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><p className="font-bold">{r.name}{r.company ? ` · ${r.company}` : ""}</p><p className="text-xs text-muted"><a className="underline" href={`mailto:${r.email}`}>{r.email}</a>{r.phone ? ` · ${r.phone}` : ""}{r.staff_count ? ` · ${r.staff_count} staff` : ""} · {fmtDateTime(r.created_at)}</p></div>
            <form action={markEnquiry.bind(null, r.id, !r.handled_at)}><button className="btn-ghost btn-sm">{r.handled_at ? "Reopen" : "Mark handled"}</button></form>
          </div>
          <p className="whitespace-pre-wrap text-sm">{r.message}</p>
        </article>
      ))}
    </div>
  );
}
