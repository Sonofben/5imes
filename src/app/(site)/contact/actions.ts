"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseForm } from "@/lib/schemas";
import { flashQuery } from "@/lib/flash";
import { friendly } from "@/lib/errors";
import { sendEmail, emailLayout, esc } from "@/lib/email";
import { CONTACT } from "@/lib/constants";

const Enquiry = z.object({
  name: z.string().trim().min(2, "Tell us your name.").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid work email.").max(200),
  company: z.string().trim().max(120).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  staff: z.string().trim().regex(/^\d{0,7}$/, "Staff count must be a number.").optional().default(""),
  message: z.string().trim().min(10, "Tell us a little more (at least 10 characters).").max(4000),
  website: z.string().optional().default(""), // honeypot: people never fill this in
});

function back(q: Record<string, string>): never {
  redirect(`/contact?${flashQuery(q)}#form`);
}

export async function sendEnquiry(formData: FormData) {
  const parsed = parseForm(Enquiry, formData);
  if (!parsed.ok) back({ error: parsed.error });
  const d = parsed.data;
  if (d.website) back({ msg: "Thanks. We’ll be in touch within one working day." });
  const supabase = await createClient();
  const staff = d.staff ? Number(d.staff) : null;
  const { error } = await supabase.rpc("submit_sales_enquiry", {
    p_name: d.name, p_email: d.email, p_company: d.company, p_phone: d.phone, p_staff: staff, p_message: d.message,
  });
  if (error) back({ error: friendly(error, "contact", "We couldn’t send your message. Please email us instead.") });
  const rows = [["Name", d.name], ["Email", d.email], ["Company", d.company], ["Phone", d.phone], ["Staff", d.staff], ["Message", d.message]];
  await sendEmail({
    to: CONTACT.sales,
    replyTo: d.email,
    subject: `Sales enquiry: ${d.company || d.name}`,
    html: emailLayout("New sales enquiry", rows.filter(([, v]) => v).map(([k, v]) => `<p><b>${esc(k)}:</b> ${esc(v).replace(/\n/g, "<br>")}</p>`).join("")),
    text: rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n"),
  });
  back({ msg: "Thanks. We’ll be in touch within one working day." });
}
