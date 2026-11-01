import type { Metadata } from "next";
import { PageHero, FeatureGrid, Section } from "@/components/site/PageHero";
import { Faq } from "@/components/site/Faq";
import { CtaBand } from "@/components/site/CtaBand";

export const metadata: Metadata = {
  title: "Leave, tasks and celebrations",
  description: "Leave requests and balances, task follow up and birthday and work anniversary celebrations, included with 5ime attendance.",
  alternates: { canonical: "/leave-tasks-celebrations" },
};

const leave = [
  { title: "Request and approve", text: "Staff ask for leave in the app. Their manager approves or declines, and balances update." },
  { title: "Never marked absent", text: "Approved leave shows on the attendance board, so nobody on leave is counted as absent." },
  { title: "Your own rules", text: "Your own leave types, allowances for everyone at once and carry over into the new year. Pro." },
];
const tasks = [
  { title: "Assign and follow up", text: "Due dates, priorities, comments and a board that shows what is late." },
  { title: "Review before done", text: "Work goes to review and the manager approves it, with checklists and files attached. Pro." },
  { title: "Reminders and reports", text: "Reminders before due dates, and a report of who finishes on time. Pro." },
];
const celebrate = [
  { title: "Birthdays and anniversaries", text: "A celebration card in the app on the day, and colleagues can send a wish." },
  { title: "Company wide email", text: "Announce celebrations to the whole company by email. Pro." },
];

const faq = [
  { q: "Is 5ime an HR system?", a: "No. 5ime is attendance and visitor management. Leave, tasks and celebrations are included because they affect who is at work, but 5ime does not do payroll, hiring or appraisals." },
  { q: "Do these cost extra?", a: "No. They are included in every plan. Pro adds the advanced options marked above." },
];

export default function MorePage() {
  return (
    <>
      <PageHero eyebrow="Also included" title="Leave, tasks and celebrations, in the same app."
        text="The everyday things that change who is at work, without buying another tool. Included in every plan." />
      <Section tone="white" eyebrow="Leave" title="Leave that keeps attendance honest."><FeatureGrid items={leave} /></Section>
      <Section eyebrow="Tasks" title="Know the work is moving."><FeatureGrid items={tasks} /></Section>
      <Section tone="white" eyebrow="Celebrations" title="Remember the people."><FeatureGrid items={celebrate} cols={2} /></Section>
      <Faq items={faq} />
      <CtaBand />
    </>
  );
}
