"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireConsoleAction } from "@/lib/console";
import { flashQuery } from "@/lib/flash";
import { friendly } from "@/lib/errors";
import { sendEmail, emailLayout, esc } from "@/lib/email";
import { siteUrl } from "@/lib/site";

export async function staffReply(id: string, f: FormData) {
  const { supabase } = await requireConsoleAction();
  const body = String(f.get("body") ?? "").trim().slice(0, 8000);
  const status = String(f.get("status") ?? "");
  const internal = f.get("internal") === "on";
  const { data: to, error } = await supabase.rpc("console_reply_ticket", {
    p_ticket: id, p_body: body, p_internal: internal, p_status: (status || null) as string, p_assign_me: f.get("assign") === "on",
  });
  if (error) redirect(`/console/support/${id}?${flashQuery({ error: friendly(error, "console/support") })}`);
  if (to && body) {
    const link = `${siteUrl()}/admin/support/${id}`;
    await sendEmail({
      kind: "support", to,
      subject: "5ime support replied to your ticket",
      html: emailLayout("5ime support replied", `<p>${esc(body).replace(/\n/g, "<br>")}</p><p><a href="${esc(link)}">Open the ticket</a> to reply.</p>`),
      text: `${body}\n\nReply here: ${link}`,
    });
  }
  revalidatePath(`/console/support/${id}`);
  redirect(`/console/support/${id}?${flashQuery({ msg: internal ? "Note added." : body ? "Reply sent to the customer." : "Ticket updated." })}`);
}
