import type { Metadata } from "next";
import { PageHero, FeatureGrid, Section } from "@/components/site/PageHero";
import { Faq } from "@/components/site/Faq";
import { CtaBand } from "@/components/site/CtaBand";

export const metadata: Metadata = {
  title: "Staff attendance with GPS check in",
  description: "GPS staff attendance for offices, branches and hybrid teams. Check in only at an approved office or approved home on scheduled days, with late, early and overtime worked out automatically.",
  alternates: { canonical: "/attendance" },
};

const core = [
  { title: "Approved offices and branches", text: "Add every office with its own check in area. Staff can only check in when their phone is inside it." },
  { title: "Approved home, on agreed days", text: "Staff ask for their home to be approved. Once an admin approves it, they can check in from home on their home days only." },
  { title: "Weekly schedules", text: "Set which days are office days and which are home days, for everyone, a team or one person." },
  { title: "Late, early and absent", text: "Grace periods, late arrivals and early exits are worked out against each person’s hours. Nobody has to do sums." },
  { title: "Automatic check in and check out", text: "Staff who open 5ime at work can be checked in automatically, and checked out at closing time, with overtime counted when they stay." },
  { title: "Public and company holidays", text: "Public holidays are built in for Nigeria, and you can add your own public and company days off anywhere. Nobody is marked absent on a holiday." },
];

const control = [
  { title: "Accuracy checks", text: "Every check in records how accurate the GPS reading was. Check ins with weak GPS or outside the approved area are recorded and flagged for admin review." },
  { title: "Requests, not workarounds", text: "Working at another site for a day, or forgot to check out? Staff send a request and a manager approves it." },
  { title: "Managers and teams", text: "Managers see their own team. Admins see everyone. Exact positions and home addresses stay private." },
  { title: "Overnight shifts", text: "A shift that crosses midnight stays open and its hours land on the right dates." },
  { title: "Reports and exports", text: "Daily, weekly and monthly attendance, lateness and hours, ready to download as CSV." },
  { title: "Your brand", text: "Your logo, colours and sign in page, so staff see your company and not ours." },
];

const faq = [
  { q: "How does GPS attendance work in 5ime?", a: "When a staff member taps Check in, 5ime reads the phone’s GPS position and its accuracy once. If the position is inside an approved office, or inside their approved home on a home day, the check in is recorded. Otherwise it is still recorded, and flagged as outside the approved area for an admin to review." },
  { q: "Does 5ime track staff all day?", a: "No. Location is read at check in and check out. Companies can switch on occasional presence checks while the app is open, but 5ime never tracks staff in the background or after work." },
  { q: "Can staff work from home and still check in?", a: "Yes, on the days their schedule says they are at home, and only from a home location an admin has approved." },
  { q: "What if someone forgets to check out?", a: "5ime can check everyone out automatically at closing time. Staff can also send a correction request, which a manager approves." },
  { q: "Does it work for companies with many branches?", a: "Yes. Pro and Premium support unlimited offices, each with its own check in area, schedules and managers." },
];

export default function AttendancePage() {
  return (
    <>
      <PageHero eyebrow="Attendance" title="Attendance you can trust, without a machine on the wall."
        text="Staff check in with their own phone, only at an approved office or their approved home, on the days they are meant to be there. You see who is in, who is late and who is at home, as it happens."
        secondary={{ href: "/pricing", label: "See pricing" }}>
        <div className="rounded-[1.6rem] border border-line bg-white p-5 shadow-[0_24px_70px_rgba(32,39,37,0.10)]">
          <p className="text-sm font-bold">Monday · Ikoyi office</p>
          <div className="mt-3 rounded-2xl border border-[#b9e0c6] bg-[#e8f5ec] p-4"><p className="text-xs font-bold text-ok">Checked in at 8:47 am</p><p className="mt-1 font-semibold">Recorded at the Ikoyi office</p><p className="mt-0.5 text-xs text-muted">Inside the office area · GPS accurate to 9 m</p></div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm"><div className="rounded-xl bg-paper p-3"><p className="text-xs text-muted">Today</p><p className="font-bold">On time</p></div><div className="rounded-xl bg-paper p-3"><p className="text-xs text-muted">This week</p><p className="font-bold">3 office, 2 home</p></div></div>
        </div>
      </PageHero>
      <Section tone="white" eyebrow="The basics, done properly" title="Right person, right place, right day."><FeatureGrid items={core} /></Section>
      <Section eyebrow="Control without micromanaging" title="Fewer arguments about attendance."><FeatureGrid items={control} /></Section>
      <Faq items={faq} />
      <CtaBand />
    </>
  );
}
