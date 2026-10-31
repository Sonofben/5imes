import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { emailLayout, esc, sendEmail } from "@/lib/email";
import { CelebrationEmails, parseOrNull, type Celebrant } from "@/lib/jsonShapes";
import { celebrationHeadline, celebrationMessage } from "@/lib/celebrationText";
import { log } from "@/lib/log";

let lastRun = 0;

function personBlock(p: Celebrant, company: string) {
  const m = celebrationMessage({ firstName: p.first_name, company, birthday: p.birthday, years: p.years });
  if (!m) return { html: "", text: "" };
  const avatar = p.avatar_url
    ? `<img src="${esc(p.avatar_url)}" alt="" width="72" height="72" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:3px solid #ffffff;box-shadow:0 0 0 2px #e1e5e2">`
    : `<div style="width:72px;height:72px;border-radius:50%;background:#182126;color:#ffffff;font-size:28px;font-weight:800;line-height:72px;text-align:center">${esc(p.first_name.slice(0, 1).toUpperCase())}</div>`;
  const html = `<div style="text-align:center;padding:16px 0;border-top:1px solid #eef0ee">${avatar}
    <p style="font-size:22px;margin:12px 0 4px">${m.emoji}</p><p style="font-size:20px;font-weight:800;margin:0 0 10px">${esc(m.title)}</p>
    ${m.lines.map((l) => `<p style="margin:0 0 8px;font-size:15px;line-height:23px">${esc(l)}</p>`).join("")}</div>`;
  return { html, text: `${m.title}\n${m.lines.join("\n")}` };
}

/**
 * Send due celebration emails: the day's announcement to the company's group email and the
 * heads-up to HR. The database hands out each one once a day, so running this often is safe.
 */
export async function runCelebrationEmails(admin: SupabaseClient<Database> | null) {
  if (!admin || Date.now() - lastRun < 5 * 60 * 1000) return;
  lastRun = Date.now();
  const { data, error } = await admin.rpc("claim_celebration_emails");
  if (error) { log.error("celebrations.claim", { message: error.message }); return; }
  const jobs = parseOrNull(CelebrationEmails, data, "celebrations/claim") ?? [];
  for (const j of jobs) {
    const brand = { logoUrl: j.logo_url, name: j.name, accent: j.accent };
    if (j.kind === "announce") {
      const blocks = j.people.map((p) => personBlock(p, j.name));
      const subject = j.people.length === 1
        ? `🎉 Celebrating ${celebrationHeadline({ name: j.people[0].first_name, birthday: j.people[0].birthday, years: j.people[0].years })} today`
        : `🎉 ${j.people.length} celebrations at ${j.name} today`;
      await sendEmail({ to: j.to, subject, html: emailLayout("Celebrating today", blocks.map((b) => b.html).join(""), brand),
        text: blocks.map((b) => b.text).join("\n\n") });
    } else {
      const when = new Intl.DateTimeFormat("en-NG", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${j.day}T00:00:00Z`));
      const list = j.people.map((p) => `<li style="margin:0 0 6px">${esc(celebrationHeadline({ name: p.name, birthday: p.birthday, years: p.years }))}</li>`).join("");
      const html = `<p>Coming up on <b>${esc(when)}</b>:</p><ul style="padding-left:18px">${list}</ul><p style="color:#68737a;font-size:13px">A heads-up so you can plan a card, a cake or a gift. Everyone gets the announcement on the day.</p>`;
      for (const to of j.to.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 10)) {
        await sendEmail({ to, subject: `Coming up: ${j.people.length} celebration${j.people.length === 1 ? "" : "s"} on ${when}`, html: emailLayout("Celebrations coming up", html, brand),
          text: `Coming up on ${when}: ${j.people.map((p) => celebrationHeadline({ name: p.name, birthday: p.birthday, years: p.years })).join("; ")}` });
      }
    }
  }
}
