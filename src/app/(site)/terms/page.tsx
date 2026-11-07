import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { BRAND } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using 5ime, the GPS attendance service for hybrid teams.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="1 November 2026"
      intro={<p>These terms apply to your use of {BRAND.name}, an attendance and visitor management service built and owned by {BRAND.legalOwner}, registered with the Corporate Affairs Commission of Nigeria ({BRAND.cacNumber}), {BRAND.address} (“we”, “us”). By creating a workspace or signing in, you agree to them. If you accept them for a company, you confirm you are allowed to do so.</p>}
      sections={[
        { heading: "The service", body: <p>{BRAND.name} lets a company record staff check ins and check outs at approved offices, approved homes, client sites and other approved places, manage visitors, and review attendance. We may improve or change features over time; we will not remove a core feature you pay for without notice.</p> },
        { heading: "Accounts", body: <ul>
          <li>Keep your sign-in details private and use two-factor authentication where your company requires it.</li>
          <li>Company administrators are responsible for who they invite and the roles they assign.</li>
          <li>Tell us promptly at {BRAND.supportEmail} if you think an account has been misused.</li>
        </ul> },
        { heading: "The company’s responsibilities", body: <p>A company using {BRAND.name} must tell its staff that attendance and location are recorded at check-in, have a lawful basis to do so, and use the data only for workforce attendance. The company is the controller of its staff and visitor data under the Nigeria Data Protection Act 2023 and, where it applies, the GDPR, and we process that data as its processor as described in our <Link href="/privacy" className="font-semibold underline">privacy notice</Link>. A data processing agreement is available on request.</p> },
        { heading: "Acceptable use", body: <p>Do not fake locations, share accounts, attempt to access other companies’ data, disrupt the service, or use it for anything unlawful. We may suspend accounts that do.</p> },
        { heading: "Trial, plans and payment", body: <ul>
          <li>New workspaces start with a free trial. No card is needed for the trial.</li>
          <li>After the trial, a paid plan is needed to keep checking in. Prices are per staff seat and shown on the Billing page in naira.</li>
          <li>Payments are processed by Paystack or Moniepoint. Plans are paid per term; automatic renewal happens only if you turn it on, and you can turn it off at any time.</li>
          <li>Fees already paid for a term are not refunded, except where the law requires it or we fail to provide the service.</li>
        </ul> },
        { heading: "Your data", body: <p>Your company owns its data. You can export attendance reports at any time. When an account is closed, data is deleted as set out in the privacy notice.</p> },
        { heading: "Availability and liability", body: <p>We work to keep {BRAND.name} available and accurate, but GPS readings depend on devices and networks, and the service is provided “as is”. To the extent the law allows, our total liability for any claim is limited to the fees the company paid us in the 12 months before the claim, and we are not liable for indirect losses.</p> },
        { heading: "Ending the service", body: <p>A company can stop using {BRAND.name} at any time. We may end or suspend access for serious breach of these terms or non-payment, with notice where reasonable.</p> },
        { heading: "Changes and governing law", body: <p>We may update these terms and will notify company administrators of significant changes. These terms are governed by the laws of the Federal Republic of Nigeria.</p> },
      ]}
    />
  );
}
