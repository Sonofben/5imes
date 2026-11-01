import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { readFlash } from "@/lib/flash";
import { TICKET_CATEGORIES, TICKET_STATUS, STATUS_TONE } from "@/lib/support";
import { replyTicket } from "../actions";

export const dynamic = "force-dynamic";

export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const flash = readFlash(await searchParams);
  const { supabase, org } = await requireMember({ admin: true });
  const [{ data: t }, { data: msgs }] = await Promise.all([
    supabase.from("support_tickets").select("id,number,subject,status,category,priority,created_at").eq("id", id).maybeSingle(),
    supabase.from("support_messages").select("id,author_name,from_staff,body,created_at").eq("ticket_id", id).order("created_at"),
  ]);
  if (!t) notFound();
  const fmt = (d: string) => new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: org.timezone }).format(new Date(d));
  const closed = t.status === "closed";
  return (
    <div className="space-y-5">
      <div><Link href="/admin/support" className="text-sm text-muted underline">All tickets</Link>
        <h1 className="page-heading mt-1">#{t.number} {t.subject}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted"><span className={`chip ${STATUS_TONE[t.status]}`}>{TICKET_STATUS[t.status as keyof typeof TICKET_STATUS]}</span>{TICKET_CATEGORIES[t.category as keyof typeof TICKET_CATEGORIES]} · opened {fmt(t.created_at)}</p></div>
      <Flash {...flash} />
      <ol className="space-y-3">{(msgs ?? []).map((m) => (
        <li key={m.id} className={`card ${m.from_staff ? "border-[#1E4E9C]/30 bg-[#f3f7fd]" : ""}`}>
          <p className="text-xs text-muted"><b className="text-ink">{m.from_staff ? "5ime support" : m.author_name}</b> · {fmt(m.created_at)}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{m.body}</p>
        </li>
      ))}</ol>
      <form action={replyTicket.bind(null, id)} className="card space-y-3">
        <label className="label" htmlFor="r-body">{closed ? "Reopen with a reply" : "Reply"}</label>
        <textarea id="r-body" name="body" rows={4} maxLength={8000} className="input" />
        <div className="flex flex-wrap gap-2"><button name="intent" value="reply" className="btn-primary">Send reply</button>{!closed && <button name="intent" value="close" className="btn-ghost">Close ticket</button>}</div>
      </form>
    </div>
  );
}
