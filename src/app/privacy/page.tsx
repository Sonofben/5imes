import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { BRAND } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How 5ime collects, uses and protects personal data, including location data used for attendance.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="18 October 2026"
      intro={<>
        <p>{BRAND.name} (“we”, “us”) is an attendance service for hybrid teams, operated by Kora Forge Solutions in Lagos, Nigeria. This policy explains what personal data we handle, why, and the choices you have. We follow the Nigeria Data Protection Act 2023.</p>
        <p>When a company uses {BRAND.name} for its staff, that company decides how attendance data is used and is the data controller for it. We process that data on the company’s behalf. For company administrators’ own accounts and billing, we are the controller.</p>
      </>}
      sections={[
        { heading: "Data we collect", body: <ul>
          <li><b>Account details:</b> name, work email address, company and role, and your password (stored only as a secure hash) or the sign-in provider you choose.</li>
          <li><b>Attendance records:</b> check-in and check-out times, the approved place used (office, approved home or an approved other place), work schedule and requests you make, such as a request to work somewhere else.</li>
          <li><b>Location:</b> your device’s GPS position at the moment you check in or out, and, while the app is open during a session, a periodic check that you are still at the approved place. We do not track location when the app is closed. Approved home addresses are visible only to the people your company allows to approve them.</li>
          <li><b>Device and security data:</b> browser or device type, IP address, sign-in times and two-factor authentication status, used to keep accounts secure.</li>
          <li><b>Billing:</b> plan, seats and payment status. Card and bank details are entered on Paystack’s or Moniepoint’s pages and are never stored by us.</li>
        </ul> },
        { heading: "Signing in with Google or Microsoft", body: <>
          <p>If you choose “Continue with Google” or Microsoft, we receive only your name, email address and profile picture from that provider, to create and sign in to your account. We do not request access to your email, files, contacts or calendar.</p>
          <p>Our use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. We do not sell this data, use it for advertising, or share it except as described in this policy.</p>
        </> },
        { heading: "How we use data", body: <ul>
          <li>To run the service: verify check-ins against the approved place and schedule, show attendance to the right managers and produce reports.</li>
          <li>To send service emails: sign-in links, invitations, approvals and billing notices.</li>
          <li>To keep the service secure, prevent misuse and fix problems.</li>
          <li>To meet legal, tax and accounting obligations.</li>
        </ul> },
        { heading: "Who can see your data", body: <>
          <p>Within your company, access follows the roles your administrators set. Ordinary managers see attendance status, not precise coordinates or home addresses.</p>
          <p>Kora Forge staff can see a company’s staff and attendance data only when that company grants support access, and that access is recorded.</p>
          <p>We use trusted service providers to run {BRAND.name}: Supabase (database and authentication), our cloud server host, Resend (email delivery), Paystack and Moniepoint (payments) and OpenStreetMap services (maps and address search). They process data only to provide their service to us. We do not sell personal data.</p>
        </> },
        { heading: "How long we keep data", body: <p>Attendance records are kept for as long as your company keeps its {BRAND.name} account, or shorter if the company deletes them. When a company closes its account, its data is deleted within 90 days, except billing records we must keep by law.</p> },
        { heading: "Your rights", body: <p>You can ask to access, correct or delete your personal data, object to its use or ask for a copy. For attendance data, please contact your company’s administrator first, as they control it; you can also email us and we will help. You may complain to the Nigeria Data Protection Commission.</p> },
        { heading: "Security", body: <p>Data is encrypted in transit, access is limited by role and row-level database rules, administrators can be required to use two-factor authentication, and sensitive actions are logged.</p> },
        { heading: "Changes to this policy", body: <p>If we make significant changes, we will update the date above and tell company administrators by email or in the app.</p> },
      ]}
    />
  );
}
