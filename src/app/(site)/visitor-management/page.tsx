import type { Metadata } from "next";
import { PageHero, FeatureGrid, Section } from "@/components/site/PageHero";
import { Faq } from "@/components/site/Faq";
import { CtaBand } from "@/components/site/CtaBand";

export const metadata: Metadata = {
  title: "Visitor management system",
  description: "Digital visitor management for Nigerian offices. Visitors sign in on their own phone, reception admits them and the host is told by email. Replace the paper visitor book.",
  alternates: { canonical: "/visitor-management" },
};

const flow = [
  { title: "Invite or walk in", text: "Send a guest an invitation, or let walk ins scan the QR poster at reception. No app and no account needed." },
  { title: "Sign in on their phone", text: "Visitors enter their details and accept your privacy notice on their own phone. No shared pen, no queue at the book." },
  { title: "Reception decides", text: "Every visitor waits on one desk screen until reception admits them or turns them away." },
  { title: "The host is told", text: "The person they came to see gets an email the moment they are admitted." },
];

const more = [
  { title: "Who’s on site", text: "Staff checked in and visitors signed in, per office, in one live list." },
  { title: "Fire drill roll call", text: "A printable list of everyone in the building, staff and visitors. Premium." },
  { title: "Reception tablet and badges", text: "Run a tablet at reception and print visitor badges. Premium." },
  { title: "Blocklist", text: "Stop people you have barred from being admitted again. Premium." },
  { title: "Records that respect privacy", text: "Visitor details are deleted automatically after the period you choose, and every action is logged." },
  { title: "Your brand on every screen", text: "Visitors see your logo and colours, not ours." },
];

const faq = [
  { q: "Do visitors need to download an app?", a: "No. Visitors scan a QR code or tap the link in their invitation and sign in in their phone’s browser." },
  { q: "Which plans include visitor management?", a: "Pro includes visitor management at one office for up to 100 visits a month. Premium covers every office with no limit, plus the reception tablet, badges, roll call, blocklist and reports. The free trial includes it." },
  { q: "Do visitors use a paid seat?", a: "No. Only your own staff use seats. Visitors are free." },
  { q: "How long are visitor records kept?", a: "You choose the retention period in settings. Records older than that are deleted automatically, which helps you meet the NDPA and the GDPR." },
];

export default function VisitorsPage() {
  return (
    <>
      <PageHero eyebrow="Visitor management" title="Retire the visitor book at reception."
        text="Visitors sign in on their own phone, reception admits them with one tap and the host gets an email. You always know who is in the building, and the records look after themselves."
        secondary={{ href: "/pricing", label: "See which plan" }}>
        <div className="rounded-[1.6rem] border border-line bg-white p-5 shadow-[0_24px_70px_rgba(32,39,37,0.10)]">
          <p className="text-sm font-bold">Reception · Waiting</p>
          {[["Mr Bello", "To see Tunde · Delivery"], ["Mrs Okafor", "To see Amaka · Interview"]].map(([n, d]) => (
            <div key={n} className="mt-3 flex items-center justify-between rounded-2xl border border-line p-3"><span><b>{n}</b><span className="block text-xs text-muted">{d}</span></span><span className="flex gap-2"><span className="rounded-lg bg-ok px-3 py-1.5 text-xs font-bold text-white">Admit</span><span className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold">Turn away</span></span></div>
          ))}
        </div>
      </PageHero>
      <Section tone="white" eyebrow="How it works" title="From the gate to the meeting room."><FeatureGrid items={flow} cols={4} /></Section>
      <Section eyebrow="For busy offices" title="Everything reception needs."><FeatureGrid items={more} /></Section>
      <Faq items={faq} />
      <CtaBand />
    </>
  );
}
