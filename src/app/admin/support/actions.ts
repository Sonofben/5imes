"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/session";
import { parseForm } from "@/lib/schemas";
import { flashQuery } from "@/lib/flash";
import { friendly } from "@/lib/errors";
import { sendEmail, emailLayout, esc } from "@/lib/email";
import { CONTACT } from "@/lib/constants";
import { siteUrl } from "@/lib/site";

const NewTicket = z.object({
  subject: z.string().trim().min(3, "Add a short subject.").max(160),
  category: z.enum(["question", "problem", "billing", "account", "feature"]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  body: z.string().trim().min(10, "Tell us a little more (at least 10 characters).").max(8000),
});

async function tellSupport(orgName: string, number: string | number, subject: string, body: string, ticketId: string, isNew: boolean) {
  const link = `${siteUrl()}/console/support/${ticketId}`;
  await sendEmail({
    kind: "support", to: CONTACT.support,
    subject: `${isNew ? "New ticket" : "Customer reply"} #${number}: ${subject} (${orgName})`,
    html: emailLayout(isNew ? "New support ticket" : "A customer replied", `<p><b>${esc(orgName)}</b></p><p>${esc(body).replace(/\n/g, "<br>")}</p><p><a href="${esc(link)}">Open in Global Admin</a></p>`),
    text: `${orgName}\n\n${body}\n\n${link}`,
  });
}

export async function openTicket(f: FormData) {
  const { supabase, org } = await requireMember({ admin: true });
  const parsed = parseForm(NewTicket, f);
  if (!parsed.ok) redirect(`/admin/support?${flashQuery({ error: parsed.error })}`);
  const d = parsed.data;
  const { data: id, error } = await supabase.rpc("open_support_ticket", { p_subject: d.subject, p_category: d.category, p_priority: d.priority, p_body: d.body });
  if (error || !id) redirect(`/admin/support?${flashQuery({ error: friendly(error, "admin/support", "We couldn’t open the ticket.") })}`);
  const { data: t } = await supabase.from("support_tickets").select("number").eq("id", id).single();
  await tellSupport(org.name, t?.number ?? "", d.subject, d.body, id, true);
  revalidatePath("/admin/support");
  redirect(`/admin/support/${id}?${flashQuery({ msg: "Thanks. Your ticket is open and the 5ime team has been told." })}`);
}

export async function replyTicket(id: string, f: FormData) {
  const { supabase, org } = await requireMember({ admin: true });
  const body = String(f.get("body") ?? "").trim().slice(0, 8000);
  const close = f.get("intent") === "close";
  const { error } = await supabase.rpc("reply_support_ticket", { p_ticket: id, p_body: body, p_close: close });
  if (error) redirect(`/admin/support/${id}?${flashQuery({ error: friendly(error, "admin/support") })}`);
  if (body) {
    const { data: t } = await supabase.from("support_tickets").select("number,subject").eq("id", id).single();
    await tellSupport(org.name, t?.number ?? "", t?.subject ?? "", body, id, false);
  }
  revalidatePath(`/admin/support/${id}`);
  redirect(`/admin/support/${id}?${flashQuery({ msg: close ? "Ticket closed." : "Reply sent." })}`);
}
