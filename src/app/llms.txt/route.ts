import { publicOrigin } from "@/lib/site";
import { loadPublicPlans } from "@/lib/plans";
import { listPosts } from "@/lib/blog";
import { FIELD_ADDON_PRICE } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** A plain summary of the public site for AI assistants (llms.txt). */
export async function GET() {
  const o = publicOrigin();
  const [{ plans, trialDays }, posts] = await Promise.all([loadPublicPlans(), listPosts().catch(() => [])]);
  const body = `# 5ime

> 5ime is staff attendance and visitor management for teams in Nigeria. Staff check in with their own phone by GPS, only at an approved office, an approved home on their home days, or a client site. Visitors sign in on their own phone and reception admits them. Priced in naira per staff member per month, with a ${trialDays} day free trial and no hardware.

## Product
- [Attendance](${o}/attendance): GPS check in at approved offices and approved homes, schedules, late and early, automatic check in and check out, overtime, Nigerian public holidays, reports.
- [Visitor management](${o}/visitor-management): visitors sign in on their own phone, reception admits them, the host is emailed, roll call and blocklist on Premium.
- [Field staff](${o}/field-staff): client site visits with notes and photos, planned visits, no tracking between visits.
- [Leave, tasks and celebrations](${o}/leave-tasks-celebrations): included in every plan.

## Pricing (per staff member per month, NGN)
${Object.values(plans).map((p) => `- ${p.name}: ₦${p.pricePerSeat}. ${p.blurb}`).join("\n")}
- Field staff on Pro: ₦${FIELD_ADDON_PRICE} per field person per month. Included in Premium.
- Details: ${o}/pricing

## Trust
- [Security and trust](${o}/security): information security aligned with ISO/IEC 27001; designed for the Nigeria Data Protection Act 2023 and the GDPR.
- [Privacy notice](${o}/privacy)
- [Terms](${o}/terms)

## Blog
${posts.map((p) => `- [${p.title}](${o}/blog/${p.slug}): ${p.excerpt}`).join("\n")}
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
