"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireConsoleAction } from "@/lib/console";
import { flashQuery } from "@/lib/flash";
import { friendly } from "@/lib/errors";
import { sendEmail, emailLayout, esc } from "@/lib/email";

export async function sendBroadcast(f: FormData) {
  const { supabase } = await requireConsoleAction();
  const back = (q: Record<string, string>): never => redirect(`/console/messages?${flashQuery(q)}`);
  const scope = String(f.get("scope") ?? "");
  const plan = String(f.get("plan") ?? "");
  const org = String(f.get("org") ?? "");
  const subject = String(f.get("subject") ?? "").trim().slice(0, 160);
  const body = String(f.get("body") ?? "").trim().slice(0, 10000);
  const reason = String(f.get("reason") ?? "");
  if (subject.length < 3 || body.length < 10) back({ error: "Write a subject and a message." });
  if (f.get("confirm") !== "on") back({ error: "Tick the box to confirm who will receive this email." });
  const { data: people, error } = await supabase.rpc("console_broadcast_recipients", { p_scope: scope, p_plan: plan || (null as unknown as string), p_org: (org || null) as string });
  if (error) back({ error: friendly(error, "console/messages") });
  const list = (people ?? []).slice(0, 2000);
  if (!list.length) back({ error: "Nobody matches. Choose another group." });
  const { data: id, error: startError } = await supabase.rpc("console_start_broadcast", {
    p_subject: subject, p_body: body, p_scope: scope, p_plan: plan || (null as unknown as string), p_org: (org || null) as string, p_recipients: list.length, p_reason: reason,
  });
  if (startError || !id) back({ error: friendly(startError, "console/messages") });
  const html = (name: string) => emailLayout(subject, `<p>Hello ${esc(name)},</p>${body.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("")}<p>The 5ime team</p>`);
  let sent = 0, failed = 0;
  // Five at a time, so a large group finishes quickly without overwhelming the email provider.
  for (let i = 0; i < list.length; i += 5) {
    const results = await Promise.all(list.slice(i, i + 5).map((p) => sendEmail({ kind: "broadcast", to: p.email, subject, html: html(p.name), text: `Hello ${p.name},\n\n${body}\n\nThe 5ime team` })));
    results.forEach((ok) => { if (ok) sent++; else failed++; });
  }
  await supabase.rpc("console_finish_broadcast", { p_id: id as string, p_sent: sent, p_failed: failed });
  revalidatePath("/console/messages");
  back(failed ? { error: `Sent to ${sent} of ${list.length}. ${failed} failed; see Operations.` } : { msg: `Sent to ${sent} admin${sent === 1 ? "" : "s"}.` });
}
