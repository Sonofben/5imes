# 5ime

> Work from anywhere, 5 days, on time.

5ime is hybrid-work attendance SaaS. Staff check in by GPS at their approved **office** or approved **home**, and the system checks that against each day's schedule. Companies pay per person per month in naira.

## Stack

- **App:** Next.js 15 (App Router), installable on phones as a PWA.
- **Styling:** Tailwind v4.
- **Data and sign-in:** Supabase.
  - Postgres with row-level security gives multi-tenancy: every row carries `org_id`, and policies keep companies apart.
  - Supabase Auth handles sign-in by Microsoft, Google, or a magic link to a company email.
- **Payments:** Paystack (NGN), routed to a subaccount.
- **Hosting:** Contabo VPS with PM2 and Nginx. See **[DEPLOY.md](DEPLOY.md)**.

## Plans

Both plans are priced per person per month.

| | Basic ₦250 | Pro ₦500 |
|---|---|---|
| **Offices** | 1 | Unlimited |
| **Check-in radius** | Fixed 200m | Custom per location |
| **Schedules** | Company-wide | Per person |
| **Manager role** | — | ✓ |
| **History** | 30 days | Unlimited |

Every company starts with a 14-day Pro trial.

## How the rules work (`supabase/migrations/0001_init.sql`)

- **Company email only.** Personal domains (Gmail, Yahoo, Outlook.com, etc.) can't create or join a company. The first admin's domain becomes the company domain.
- **Joining.** Invited people become active on first sign-in. Anyone else with the company domain who signs in waits as *pending* until an admin approves them.
- **Home location.** Staff pin it once, from home, and an admin approves it. Changing it needs approval again; the old home location stays valid until the new one is approved.
- **Check-in rules.** `check_in()` runs on the database server, so the browser can't fake the result. It:
  - finds the nearest office within its radius, otherwise the approved home within the home radius;
  - compares that place with the day's schedule;
  - sets flags: late, early exit, out of range, wrong location, weak GPS, non-working day;
  - stores IP and device.
- **Attendance rows are append-only from the client.** There are no insert or update policies, so rows are written only by `check_in()`.
- **Plan limits are enforced in the database:** office count, radius, and the manager role.

## Tests

GitHub runs these automatically on every push. Results show under the repo's **Actions** tab, and as a ✅ or ❌ next to each commit.

- **Database rules** (`supabase/tests/10_attendance_rules.sql`, 37 checks). The suite covers:
  - Gmail blocking
  - invites and approvals
  - office and home check-in, plus flags
  - staff unable to tamper with records
  - one company unable to see another's data
  - Basic-plan limits
  - trial expiry
- **Lint, type-check and production build** of the app.

To run the database tests yourself, use a **throwaway** Postgres 16. Never run them against your real Supabase project.
```bash
cd supabase
psql -v ON_ERROR_STOP=1 -f tests/00_supabase_stub.sql -f migrations/0001_init.sql -f tests/10_attendance_rules.sql
```
Each check prints `PASS: …` and the run ends with `✅ ALL DATABASE TESTS PASSED`. The first failure stops with `FAIL: …`.

## Local development

```bash
cp .env.example .env.local   # fill in Supabase keys
npm install
npm run dev
```

**GPS needs HTTPS.** On localhost it works in desktop browsers. To test on a phone, deploy, or tunnel with HTTPS.

## Known limits / v2

- Browser GPS can be spoofed by a determined user. 5ime reduces this with accuracy checks, IP and device logging, and flags. Planned stronger options: selfie check-in and native apps.
- Planned features:
  - Microsoft/Google directory sync
  - leave management
  - payroll export
  - automatic recurring billing (Paystack authorization charge)
  - daily email summaries
  - Excel/PDF reports
