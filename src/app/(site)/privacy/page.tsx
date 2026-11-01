import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { BRAND, CONTACT } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "How 5ime collects, uses and protects personal data under the Nigeria Data Protection Act 2023 and the GDPR, including location data used for attendance.",
  alternates: { canonical: "/privacy" },
};

const m = (e: string) => <a className="font-semibold underline" href={`mailto:${e}`}>{e}</a>;

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy notice"
      updated="1 November 2026"
      intro={<>
        <p>This notice explains how {BRAND.name} (“we”, “us”) handles personal data when you use our website and our attendance and visitor management service. It is written to meet the Nigeria Data Protection Act 2023 (NDPA) and, where they apply, the EU General Data Protection Regulation and the UK GDPR.</p>
        <p>Contact us about privacy at {m(CONTACT.privacy)}. This address also reaches our data protection officer.</p>
      </>}
      sections={[
        { heading: "Who is responsible for your data", body: <>
          <p><b>Staff and visitor data.</b> When a company uses {BRAND.name}, that company is the data controller for its staff’s attendance, leave, task and field visit records and for its visitors’ details. We process that data on the company’s documented instructions as its data processor. If you are a staff member or visitor, your employer or the company you visited is your first point of contact.</p>
          <p><b>Account, billing and website data.</b> We are the controller for company administrators’ account and billing details, for enquiries sent to us and for data collected on our website.</p>
        </> },
        { heading: "The data we process", body: <ul>
          <li><b>Account details:</b> name, work email address, company, role and team, and sign in security data such as two factor status. Passwords are stored only in a protected form.</li>
          <li><b>Attendance records:</b> check in and check out times, the approved place used, work schedules, leave, and requests such as corrections or working elsewhere.</li>
          <li><b>Location:</b> the phone’s position and its accuracy at the moment of check in or check out, and, only if your company switches it on, an occasional check while the app is open. We never track location in the background or after work. For field visits we keep the distance from the client site and the accuracy, not a route.</li>
          <li><b>Approved home location:</b> where a staff member asks to work from home, the location they submit for approval. Only the people their company allows to approve it can see it.</li>
          <li><b>Visitor details:</b> name, contact details, who they came to see, the purpose of the visit, times, and a photo where the company’s reception tablet takes one.</li>
          <li><b>Work content:</b> tasks, comments, files, visit notes and photos that users add.</li>
          <li><b>Device and usage data:</b> device and browser type, IP address and sign in times, used for security and to fix problems.</li>
          <li><b>Billing:</b> plan, seats, amounts and payment status. Card and bank details are entered with our payment providers and are never stored by us.</li>
          <li><b>Enquiries:</b> the details you send through our contact form or by email.</li>
        </ul> },
        { heading: "Why we use it and our legal basis", body: <ul>
          <li><b>To provide the service</b> to the company that subscribes, including checking a check in against the approved place and schedule and producing reports. Basis: performance of a contract, and for staff data, the company’s own lawful basis as controller.</li>
          <li><b>To keep the service and accounts secure</b>, detect misuse and fix faults. Basis: legitimate interests.</li>
          <li><b>To send service messages</b> such as invitations, approvals, reminders and billing notices. Basis: performance of a contract.</li>
          <li><b>To reply to enquiries</b> and talk to prospective customers. Basis: legitimate interests, or steps taken at your request before a contract.</li>
          <li><b>To meet legal, tax and accounting duties.</b> Basis: legal obligation.</li>
        </ul> },
        { heading: "Sign in with Google or Microsoft", body: <>
          <p>If you choose to sign in with Google or Microsoft, we receive only your name, email address and profile picture, to create and sign in to your account. We do not request access to your email, files, contacts or calendar.</p>
          <p>Our use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.</p>
        </> },
        { heading: "Who we share data with", body: <>
          <p>Inside a company, access follows the roles its administrators set. Ordinary managers see attendance status, not exact positions or home addresses.</p>
          <p>Our own team can see a company’s staff and visitor data only when that company grants time limited support access, and that access is logged.</p>
          <p>We use service providers for cloud hosting and storage, email delivery, payment processing and maps. They act on our instructions under written data protection terms and may not use the data for their own purposes. A current list is available from {m(CONTACT.privacy)}.</p>
          <p>We may disclose data where the law requires it. We do not sell personal data and we do not use it for advertising.</p>
        </> },
        { heading: "International transfers", body: <p>Some of our providers process data outside Nigeria. Where that happens, we rely on the safeguards the NDPA and the GDPR allow, such as adequacy decisions or standard contractual clauses, and we choose providers with strong security commitments.</p> },
        { heading: "How long we keep data", body: <ul>
          <li>Attendance and work records: for as long as the company keeps its account, or shorter if the company deletes them.</li>
          <li>Visitor records: for the period the company sets, then deleted automatically.</li>
          <li>When a company closes its account, its data is deleted within 90 days, except billing records we must keep by law.</li>
          <li>Sales enquiries: up to two years.</li>
          <li>Security logs: for as long as needed to protect the service, then deleted.</li>
        </ul> },
        { heading: "Your rights", body: <>
          <p>Under the NDPA and the GDPR you can ask to access your personal data, correct it, delete it, restrict or object to its use, receive a copy in a portable format, and withdraw consent where we rely on consent. You will not be subject to decisions with legal effects made only by automated means; attendance flags such as “late” are information for your employer to review.</p>
          <p>For staff and visitor data, please ask the company first, as it controls that data; we will help it respond. For anything else, email {m(CONTACT.privacy)}. We reply within the time the law sets.</p>
          <p>You can complain to the Nigeria Data Protection Commission, or, if the GDPR applies to you, to your local supervisory authority.</p>
        </> },
        { heading: "Security", body: <p>We protect personal data with technical and organisational measures that follow the ISO/IEC 27001 framework, including role based access, encryption in transit and at rest, logging of sensitive actions and tested separation between companies. Read more on our <Link href="/security" className="font-semibold underline">Security and trust</Link> page. If a breach affects your data, we will tell you and the regulator as the law requires.</p> },
        { heading: "Cookies", body: <p>We use only cookies that are strictly necessary to sign you in, keep your session secure and remember choices such as dismissing a notice. We do not use advertising or tracking cookies.</p> },
        { heading: "Children", body: <p>{BRAND.name} is a workplace service and is not meant for children under 18.</p> },
        { heading: "Changes to this notice", body: <p>If we make significant changes we will update the date above and tell company administrators by email or in the app.</p> },
      ]}
    />
  );
}
