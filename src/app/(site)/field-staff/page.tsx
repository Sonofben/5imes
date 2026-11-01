import type { Metadata } from "next";
import { PageHero, FeatureGrid, Section } from "@/components/site/PageHero";
import { Faq } from "@/components/site/Faq";
import { CtaBand } from "@/components/site/CtaBand";
import { FIELD_ADDON_PRICE, naira } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Field staff visit check in",
  description: "Field sales and service teams check in at client sites with notes and photos. Plan visits, see planned against done, and never track staff between visits.",
  alternates: { canonical: "/field-staff" },
};

const items = [
  { title: "Your client sites", text: "Keep a list of shops, offices and sites with a map pin and a check in area. Add them one by one or in bulk." },
  { title: "Check in on arrival", text: "Field staff check in when they reach the site. 5ime confirms they are there and how accurate the reading is." },
  { title: "Notes, outcome and a photo", text: "At check out they add what happened and a photo, so the visit report is written on the spot." },
  { title: "Planned visits", text: "Managers plan visits for their team by day. You see planned against done, every day." },
  { title: "Short visits flagged", text: "Very short visits are flagged for a second look, without accusing anyone." },
  { title: "No tracking in between", text: "5ime reads location only at check in and check out of a visit. It never follows staff around the city." },
];

const faq = [
  { q: "Does 5ime track field staff with live GPS?", a: "No. 5ime records the distance from the site and the accuracy at check in and check out. It does not store a route or follow staff between visits." },
  { q: "How much is field staff?", a: `Field staff is included in Premium. On Pro it is an add on at ${naira(FIELD_ADDON_PRICE)} per field person a month, paid with your plan.` },
  { q: "Can a field worker check in from the office too?", a: "Yes. Field staff use normal attendance at the office and visit check in at client sites, in the same app." },
  { q: "What do managers see?", a: "Managers see their own team’s planned and completed visits, the notes and photos, and a report of visits per person." },
];

export default function FieldStaffPage() {
  return (
    <>
      <PageHero eyebrow="Field staff" title="Proof of every client visit. Nothing in between."
        text="Sales reps, engineers and officers check in at the client’s site, add a note and a photo, then check out. Managers plan the day and see what was done, without tracking anyone across the city."
        secondary={{ href: "/pricing", label: "See pricing" }}>
        <div className="rounded-[1.6rem] border border-line bg-white p-5 shadow-[0_24px_70px_rgba(32,39,37,0.10)]">
          <p className="text-xs text-muted">Field visit · Planned: Restock check</p><p className="text-lg font-bold">Shoprite Lekki</p>
          <div className="mt-3 rounded-2xl border border-[#b9e0c6] bg-[#e8f5ec] p-4"><p className="text-xs font-bold text-ok">Checked in at 11:20 am</p><p className="text-xs text-muted">16 m from the site</p></div>
          <p className="mt-3 rounded-xl border border-line p-3 text-sm text-muted">Shelves restocked. Manager asked for two more cartons next week.</p>
        </div>
      </PageHero>
      <Section tone="white" eyebrow="How it works" title="Built for teams that work outside the office."><FeatureGrid items={items} /></Section>
      <Faq items={faq} />
      <CtaBand />
    </>
  );
}
