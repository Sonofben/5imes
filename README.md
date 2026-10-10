# 5ime

> Your schedule. Your approved workplace. On time.

5ime is scheduled-work attendance software. Staff check in by GPS only at an approved **office**, or at their individually approved **home** on days assigned as home days. It does not mean employees can check in from any location. The system checks attendance against the team’s schedule—including a shift that crosses midnight. Companies pay per person in naira.

## Stack

- **App:** Next.js 16 App Router, installable on phones as a PWA.
- **Styling:** Tailwind CSS v4.
- **Data and sign-in:** Supabase Auth and Postgres with row-level security.
- **Payments:** Paystack recurring plans in NGN.
- **Hosting:** Docker container on the shared Contabo VPS, behind the host's Nginx. See [DEPLOY.md](DEPLOY.md).

## Plans and billing

| Plan | Price per seat per month | Typical fit |
|---|---:|---|
| Basic | ₦250 | One office and a shared weekly schedule |
| Pro | ₦500 | Branches, individual schedules and manager tools |

The 14-day Pro trial remains available. Customers can pay monthly, quarterly (3 months), biannually (6 months), or yearly (12 months). **There are no multi-month discounts**: the term charge is seats × monthly price × months. For example, 10 Basic seats cost ₦2,500 monthly or ₦7,500 quarterly.

Active and invited people share the paid-seat limit. An admin can add capacity during an active term: the added seats’ charge is prorated by the exact remaining time in the term, rounded to the nearest kobo. Once Paystack verifies payment, the added seats are activated first; the organization’s recurring plan is then updated to the full new seat count for the next renewal. If that provider update temporarily fails, the payment stays recorded, the admin sees a retry action, and retrying does not charge again. The existing renewal date is unchanged. Cancellation stops future renewal while access continues to the end of the paid term. Only one unresolved checkout is allowed per organization; admins resume or verify that attempt before another charge can be started.

## Setup

1. Copy `.env.example` to `.env.local` and enter the Supabase Project URL, public anon or `sb_publishable_` key, and server-only service-role key.
2. In Supabase SQL Editor, apply `supabase/migrations/0001_init.sql`, then `0002_security_billing_attendance.sql`, then `0003_payment_history_attendance_corrections.sql`, then `0004_attendance_device_privacy.sql`, in that order. This repository currently uses direct SQL application and has no Supabase CLI project config or migration-history baseline. If you later adopt `supabase db push`, set up and reconcile the CLI migration history first; do not replay these files as unrecorded migrations. Migration 0002 includes tenant and seat enforcement, private location storage, overnight attendance, and payment ledgers; migration 0003 adds employee correction requests and audited manager decisions; migration 0004 restricts employees' IP/device details to admins.
3. Install and run:

   ```bash
   npm install
   npm run dev
   ```

4. Complete Paystack account onboarding/compliance. Then set `PAYSTACK_SECRET_KEY` on the server. Configure the Paystack webhook to `https://<your-domain>/api/paystack/webhook` and make sure the application callback URL matches `NEXT_PUBLIC_SITE_URL`. Charges settle to the main Paystack account unless `PAYSTACK_SUBACCOUNT` (an `ACCT_…` code) is set; confirm in Paystack test mode how the subaccount applies to recurring renewals before relying on it.
5. Before release, run `npm test`, `npm run lint`, `npm run build`, and test checkout/webhook handling in Paystack test mode.

Do not commit live API keys. The service-role key and Paystack secret must stay server-side. GPS requires HTTPS on devices; localhost works for desktop browser testing.

## Follow-up workflows

- Billing shows recorded payment attempts; receipts are available for confirmed payments and can be printed or saved as PDF. A receipt is based on 5ime's payment record, not a tax invoice or payment-provider receipt.
- The manager dashboard shows late check-ins and missed check-ins after work-end plus the configured grace period. These are in-app alerts only; no email or SMS service is configured.
- Employees may request a correction to one or both times for a work date. A manager or admin must approve it before attendance changes. Approved entries are marked in reports, and the audit log preserves who requested/reviewed the correction and the before/after times. Corrected entries do not invent GPS data.

The included deployment guide runs 5ime in a Docker container on a shared Contabo VPS behind Nginx. Other hosting platforms can be used if they support a running Next.js/Node.js server; a static-only website host is not sufficient for this app.

## Important rules

- Personal email domains (such as Gmail, Yahoo, and Outlook.com) cannot create or join an organization; the first admin’s domain becomes the company domain.
- Invited people become active on first sign-in. Other people with the company domain wait for admin approval.
- Check-in decisions run in Postgres; client-submitted location cannot determine its own approval. Precise home and attendance coordinates are kept in private tables rather than manager-readable attendance rows.
- The admin dashboard’s paid-seat count includes both active and invited people. Database constraints and RPCs enforce tenant boundaries and capacity, including bulk invitations.
- Company times, reports, billing renewals, and overnight shifts use the organization’s validated IANA time zone.

## Verification

The core test suite covers billing totals, exact remaining-term proration, calendar renewals, CSV parsing, and spreadsheet formula injection. `npm audit` should be reviewed on every dependency update; Next.js 16.4.0 is currently used to address the available upstream Next.js security fixes.

## Tests

GitHub runs these on every push (repo **Actions** tab):
- **Database rules:** applies migrations 0001–0004 to a throwaway Postgres and runs `supabase/tests/` (sign-up rules, tenant isolation, manager privacy, payment ledger lock-down, seat limits, attendance corrections).
- **App:** lint, unit tests (`npm test`) and production build.
