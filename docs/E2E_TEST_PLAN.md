# 5ime — End-to-End Test Plan (live site)

**Site:** https://5imes.koraforge.com.ng
**Product:** 5ime — "Work from anywhere, 5 days, on time." GPS attendance: staff check in only at an approved **office**, or at their individually approved **home** on days scheduled as home days.
**Test workspace:** Trostechnologies (email domain `@trostechnologies.com`)
**Code:** github.com/Sonofben/5imes (branch `main`)

---

## 0. Instructions for the tester

1. Follow the sections in order. Each test has an **ID**, **steps** and **expected result**.
2. Record every test as **PASS / FAIL / BLOCKED** in the results table (section 12).
3. For every FAIL, write a bug report using the template in section 13: steps, expected, actual, URL, screenshot, and any reference code shown on an error page.
4. If a page shows **"This page couldn’t load … reference `NNNN`"**, copy the reference number. The developer matches it to the server log.
5. **Do not** make real payments. Online payment is not live yet; only check that the billing pages display correctly.
6. Use a **separate browser profile or incognito window per user**: Admin, Staff 1, Staff 2. Sessions are per browser.

### Faking GPS (needed for check-in tests)
In Chrome: DevTools (F12) → ⋮ → **More tools → Sensors** → **Location** → choose *Other…* and enter latitude/longitude. Reload the page after changing it. Allow location permission when the site asks.

| Name | Latitude | Longitude | Use |
|---|---|---|---|
| **Office — Victoria Island** | 6.4281 | 3.4219 | Office location to create |
| Inside office radius (≈40 m away) | 6.4284 | 3.4221 | Valid office check-in |
| **Home — Staff 1 (Lekki)** | 6.4474 | 3.4720 | Staff 1 pins home here |
| Far away (Ikeja) | 6.6018 | 3.3515 | Must be flagged / refused as out of range |

---

## 1. Accounts

| Role | Email | Password | Notes |
|---|---|---|---|
| Workspace admin (owner) | joseph.benson@trostechnologies.com | (owner enters it) | Already created. Admin pages require 2FA (authenticator app). The owner will enter codes. |
| Staff 1 | testuser@trostechnologies.com | Test@P3word | Set during invitation acceptance |
| Staff 2 | tester2@trostechnologies.com | Test@P3word | Set during invitation acceptance |
| Negative test | anyone@gmail.com | anything | Must be refused (public email domain) |

---

## 2. Pre-checks (Supabase settings — owner confirms before testing)

- [ ] Migrations 0001–0010 applied (0009 security status fix, 0010 API grants).
- [ ] Authentication → URL Configuration: Site URL = `https://5imes.koraforge.com.ng`; redirect URL `https://5imes.koraforge.com.ng/auth/callback**` added.
- [ ] Authentication → Emails → **Invite user** template link = `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite`
- [ ] (Recommended) **Confirm signup** template link = `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`
- [ ] Latest code deployed on the VPS (`cd /opt/apps/5ime && git pull && docker compose up -d --build`).

---

## 3. Public pages and SEO

| ID | Steps | Expected |
|---|---|---|
| P1 | Open `/` on desktop | Landing loads: logo **5ime**, headline “Know your team is where they planned to be.”, buttons “Start a 14-day Pro trial” and “See how it works”, How it works, Features, Pricing (Basic ₦250, Pro ₦500 per seat per month) |
| P2 | Open `/` at phone width (375 px) | No horizontal scrolling; text readable; buttons tappable |
| P3 | Click every link/button on `/` | All go somewhere valid (no 404) |
| P4 | Open `/robots.txt` | Plain text; allows `/`, `/login`, `/signup`; disallows `/admin`, `/app`, `/console`, `/auth/`, `/api/`; shows `Sitemap: https://5imes.koraforge.com.ng/sitemap.xml` |
| P5 | Open `/sitemap.xml` | XML listing `/`, `/signup`, `/login` on the 5imes domain |
| P6 | View page source of `/` | Has `<title>`, meta description, `og:title`, `og:description`, `og:image`, `twitter:card`, canonical link, JSON-LD `SoftwareApplication` with NGN prices |
| P7 | Open `/manifest.webmanifest` | JSON with name “5ime — scheduled attendance”, icons |
| P8 | Open `/does-not-exist-xyz` | Clean 404 page, not a crash |

---

## 4. Sign-up, sign-in and routing

| ID | Steps | Expected |
|---|---|---|
| A1 | Open `/login` | Email + password form, “Forgot password?”, “Can’t sign in? Use a one-time code instead”, link to Create a workspace. Microsoft/Google buttons appear **only if** enabled in Supabase; they must not flash and disappear |
| A2 | `/signup`: type email `someone@gmail.com` | Refused: “Use your company email…” |
| A3 | `/signup`: type email `x@acme-foods.com.ng` (don’t submit) | “Company / workspace name” auto-fills **“Acme Foods”**; editing the name stops auto-fill |
| A4 | `/signup`: mismatched passwords; then a password under 8 chars | Clear error each time; nothing created |
| A5 | `/login` with the admin account (owner enters password, then 2FA if asked) | Lands on **/admin** (or **/onboarding** “Confirm your workspace” if the workspace was never confirmed). **Must not** bounce between `/admin` and `/start` |
| A6 | (If shown) Onboarding: check the “Confirm your workspace” card | Shows Company email `@trostechnologies.com`, Role “Workspace admin (owner)”, Plan “14-day Pro trial”; Workspace name prefilled “Trostechnologies”; button “Confirm and start my 14-day trial” → goes to `/admin` |
| A7 | Wrong password on `/login` | Friendly error, stays on page |
| A8 | “Forgot password?” → enter admin email → open email link (same device) | Lands on “Choose a new password”; after setting it, signs in |
| A9 | Visit `/admin` while signed out | Redirected to `/login` |
| A10 | Sign out (top right) | Returns to sign-in / landing; `/admin` now requires sign-in |

---

## 5. Admin — first landing and two-factor

| ID | Steps | Expected |
|---|---|---|
| B1 | After sign-in, view `/admin` | Admin home “Today”. A **setup checklist** at the top: 1 Turn on two-factor, 2 Add your office, 3 Check the work week, 4 Invite your staff. Trial banner “Your Pro trial has N days left” |
| B2 | Click “Set up” (two-factor) | `/admin/security?setup=1`: password & two-factor page; QR code for authenticator. **Owner scans and enters code** |
| B3 | After 2FA is on | Security page shows it enabled; “← Back to admin home” link; checklist step 1 shows ✓ |
| B4 | Open `/admin/locations` before 2FA (if testing a fresh admin) | Redirected to `/admin/security?setup=1` with message to finish two-factor |
| B5 | Sign out and in again (2FA enrolled) | After password, asked for 6-digit code (`/auth/challenge`); then admin pages open |
| B6 | Generate recovery codes on the security page | 10 codes shown once, format `XXXXX-XXXXX` |

---

## 6. Admin — workspace setup

| ID | Steps | Expected |
|---|---|---|
| C1 | `/admin/locations` → Add an office: name “VI Office”, lat 6.4281, lng 3.4219, radius 150 | Office listed; checklist step 2 ✓ on `/admin` |
| C2 | Edit radius to 200 → Save | Saved message; value persists after reload |
| C3 | Try adding an office with blank name or invalid coordinates | Validation error, nothing saved |
| C4 | `/admin/schedule` → Company default: Mon–Wed **office**, Thu–Fri **home**, Sat–Sun **off** → Save default | “Schedule saved.”; persists after reload |
| C5 | `/admin/settings` → Company settings: work start 09:00, end 17:00, grace 10 min, home radius 100 m, time zone Africa/Lagos → Save | Saved; email domain shown read-only as `trostechnologies.com` |
| C6 | Settings → Branding: company link `trostech`, brand colour `#1F6FEB`, upload a PNG logo < 1 MB → Save branding | Saved; logo shows in admin header |
| C7 | Branding: upload a file > 1 MB, or a PDF | Refused with a clear message |
| C8 | Branding: company link `admin` or `login` (reserved) | Refused |
| C9 | Open `https://5imes.koraforge.com.ng/trostech` signed out | Branded staff sign-in page: logo, brand colour, “Trostechnologies staff portal”, “Powered by 5ime” |
| C10 | Settings → Support access: Grant 24 hours | Shows active until a time; “Turn off now” works; support log visible |
| C11 | `/admin/billing` | Shows trial status, plans Basic/Pro, terms 1/3/6/12 months, no multi-month discount, auto-renew unticked by default. **Do not pay** |

---

## 7. Admin — inviting staff

| ID | Steps | Expected |
|---|---|---|
| D1 | `/admin/staff` → Invite a person: `testuser@trostechnologies.com`, name “Test User”, team “Engineering”, role Staff → Send invitation | “Invitation emailed to testuser@…” and the person listed as **Invited** |
| D2 | Invite `tester2@trostechnologies.com`, name “Tester Two”, role **Manager** | Invited; role Manager |
| D3 | Invite `someone@gmail.com` or `x@otherdomain.com` | Refused: not a @trostechnologies.com address |
| D4 | Invite `testuser@trostechnologies.com` again | Refused: already added |
| D5 | Bulk: paste CSV `email,name,team` with one valid and one wrong-domain row → Validate | Wrong row reported by row number; nothing half-imported |
| D6 | `/admin` checklist | Step 4 “Invite your staff” ✓ |

---

## 8. Staff 1 — invitation, first run, home, check-in

Use a **separate incognito window**. Fake GPS per section 0.

| ID | Steps | Expected |
|---|---|---|
| E1 | Open the invitation email for testuser@ → click the link | Opens “Welcome — set your password” on 5ime (not an error, not “link expired”) |
| E2 | Set password `Test@P3word` (both fields) | Signed in and taken to **/app** (staff check-in screen) |
| E3 | First-run welcome steps | Step-by-step: allow location → pin home (if home days exist) → add to home screen instructions; “Skip / next” works |
| E4 | GPS = Home Lekki (6.4474, 3.4720) → “I’m at home — pin it” | “Home location sent to your admin for approval.”; Home location panel shows “Waiting for admin approval” |
| E5 | Admin window → `/admin/staff` → Home location requests → Approve testuser | Approved; staff panel shows approved home and a **small map** of home |
| E6 | Staff: GPS = inside office (6.4284, 3.4221) on an **office** day → Check in | “Check-in recorded”; shows check-in time; status “You’re currently checked in” |
| E7 | Staff: Check out | “Check-out recorded” |
| E8 | Staff: GPS = Far away Ikeja (6.6018, 3.3515) → Check in | Refused or flagged “Outside any approved location” |
| E9 | Staff: GPS = Home on a **home** day → Check in | Recorded as home |
| E10 | Staff: GPS = Home on an **office** day | Flagged “Wrong location for today” (or refused) |
| E11 | Staff: on an **off** day | “Today is a non-working day” shown |
| E12 | Check in after 09:10 (start 09:00 + 10 min grace) | Flagged **Late** |
| E13 | Staff `/app/corrections` → request correction for yesterday: check-in 09:00, reason “Forgot to check in” | Listed as pending |
| E14 | Staff tries to open `/admin` | Sent back to `/app` (no admin access) |
| E15 | Phone width (375 px) | Whole staff app usable on phone |

---

## 9. Staff 2 (Manager)

| ID | Steps | Expected |
|---|---|---|
| F1 | Accept invitation for tester2@ (incognito), set password `Test@P3word` | Lands on `/admin` (managers see the dashboard) or `/app` with an “Admin” link |
| F2 | Manager opens `/admin`, `/admin/reports`, attendance corrections | Allowed |
| F3 | Manager opens `/admin/settings`, `/admin/billing`, `/admin/locations` | Not allowed (redirected) |
| F4 | Manager approves Staff 1’s correction (E13) | Approved; report shows the entry marked corrected |
| F5 | Manager’s own check-in from `/app` | Works like staff |

---

## 10. Admin — monitoring and reports

| ID | Steps | Expected |
|---|---|---|
| G1 | `/admin` Today | Counts (checked in now, at office, at home, not in yet, needs attention) match what staff did; people listed with status and exceptions |
| G2 | `/admin/reports` for today | Per-person summary: days present, office/home, late, flagged, hours |
| G3 | Export CSV | Downloads; opens in Excel/Sheets; includes IP/device columns for admin |
| G4 | `/admin/staff` → disable Staff 1 → Staff 1 reloads `/app` | Staff 1 blocked (“access disabled”) ; re-enable restores |
| G5 | Change Staff 1 role to Manager and back | Saved |
| G6 | Remove a person (not the owner) | Removed; owner cannot be removed or demoted |

---

## 10b. Maps, line managers and working somewhere else

| ID | Steps | Expected |
|---|---|---|
| M1 | Admin `/admin/locations` → Add an office: search “Adeola Odeku, Victoria Island” → pick a result | Map moves there, pin + radius circle shown, Address filled |
| M2 | Drag the radius slider; tap elsewhere on the map | Circle resizes; pin moves; address updates |
| M3 | Save the office | Office card shows the address and a small map; overview map shows all offices |
| M4 | Staff pins home (E4) → Admin People → Home location requests | Request shows a map (requested pin amber, current home green if any) and the street address |
| M5 | Staff `/app` after home approved | “Your approved home” map with the home circle and address |
| M6 | Admin `/admin` (Today) with someone checked in | “Where people checked in” map: dots for office / home / approved other place / outside |
| L1 | Admin → People → set Staff 1’s Line manager = Staff 2 (Manager) → Save | “Line manager saved.” |
| W1 | Staff 1 checked in at the office → GPS = Ikeja (6.6018, 3.3515) → “Ask to work somewhere else” → reason “Client meeting” → Send | Card “Waiting for Tester Two” with a map of the requested place |
| W2 | Staff 2 (line manager) → `/admin/requests` | Request listed with map, address, reason; nav badge on “Location requests” |
| W3 | Staff 2 approves | Staff 1 card “Approved”; Staff 1 is **still checked in** (no break); check-out at Ikeja shows “approved other place” |
| W4 | New session: Staff 1 asks again → Staff 2 rejects with reason “Not agreed” | Staff 1 is checked out at the **time they asked** (not the decision time); flag “Moved without approval” |
| W5 | Reject without a reason | Refused: “Give a short reason for rejecting.” |
| W6 | A manager who is not Staff 1’s line manager opens `/admin/requests` | Does not see Staff 1’s request (admins see all) |
| W7 | Staff 1 checked in at the office, 5ime open, GPS moved to Ikeja; switch away and back after 15 min | Amber banner “You seem to be away from your approved place (since …)”; line manager sees “Left their approved place without asking” |
| W8 | Line manager clicks “End session at …” | Staff 1 checked out at the time they left, flagged |
| W9 | Staff 1 has a waiting request → Cancel request | Cancelled; can ask again |

## 10c. Global Admin (`/console`, Kora Forge team only)

Needs an account on the Global Admin team (first one added with the SQL in DEPLOY.md) and two-factor.

| ID | Steps | Expected |
|---|---|---|
| GA1 | Open `/console` as a normal company admin | 404 page |
| GA2 | Open `/console` as Global admin → complete two-factor | “Platform overview” with tiles, two bar charts and “Companies that need attention” |
| GA3 | Plans & pricing → Basic price 300, reason “Test price” → Save | Saved; landing page and company Billing show ₦300 within 5 minutes; set it back to 250 after |
| GA4 | Plans & pricing → trial 21 days → Save; create a new workspace by sign-up | New company’s trial ends in 21 days |
| GA5 | Announcements → “Test banner”, Information, all companies, 1 day → Publish | Banner on company `/admin` and staff `/app`; “End now” removes it |
| GA6 | Maintenance mode on with a message | Staff check-in shows the message and is refused; turn it off → check-in works |
| GA7 | Companies → Create a company (name, domain, owner email, 14 days, reason) | Company page opens; owner receives invitation; after setting password owner lands on `/admin` |
| GA8 | Company page → Change plan and seats (Basic, 10) | Plan/seats updated; audit shows it |
| GA9 | “View as company admin” before the company grants support access | Refused with a clear message |
| GA10 | Company admin grants 24 h support access → View as company admin | Read-only view of people, today’s attendance, offices map, work week; the company’s support log shows the view |
| GA11 | Export company data (with reason) | JSON downloads; staff included only while support access is on |
| GA12 | Archive company → appears under “Show archived”; Delete with wrong domain → refused; with right domain → deleted | Audit log keeps a “company.delete” entry |
| GA13 | Revenue → filter Confirmed → Download CSV | CSV opens in Excel/Sheets |
| GA14 | People → search part of an email | Refused (“full email”) |
| GA15 | People → full email of Staff 1 → Sign out everywhere | Staff 1’s session ends (next page load asks to sign in) |
| GA16 | Lock Staff 1 → Staff 1 tries to sign in | Refused; Security center lists them; Unlock restores access |
| GA17 | Reset two-factor for a company admin | Their next admin page asks them to set up two-factor again |
| GA18 | Team → add a Kora Forge email as Read-only admin | Invitation (if no login) or added; that person can view but every change button is hidden/refused |
| GA19 | Team → try to demote/remove the only Global admin | Refused |

## 11. Isolation and security spot-checks

| ID | Steps | Expected |
|---|---|---|
| H1 | Staff 1 tries `/admin/staff`, `/admin/reports/export` directly | No access |
| H2 | Any non-platform user opens `/console` | 404 / not available |
| H3 | Sign up a second company with a different domain (e.g. `@koraforge.com.ng` if available) | Sees only its own people; nothing from Trostechnologies |
| H4 | A new person signs up with `@trostechnologies.com` without an invite | Goes to “waiting for approval”; admin sees them under “People waiting for approval” |
| H5 | `/auth/challenge?next=https://google.com` after sign-in | Does **not** redirect to google.com |

## 11b. Security hardening (migration 0014)

| ID | Steps | Expected |
|---|---|---|
| S1 | Open `/login?error=Your+account+is+locked.+Call+0803` and `/admin/staff?msg=Pay+now` | The fake text is **not** shown anywhere on the page |
| S2 | Any action that fails (e.g. invite an email from another domain) | A plain sentence; never database wording such as “permission denied for table…” or “violates constraint” |
| S3 | Something unexpected fails | “Something went wrong… (ref ABC123)”; give the ref to the owner — it finds the full error in the server log |
| S4 | Sign-in, sign-up, one-time code, forgot password (with CAPTCHA switched on) | Works; usually no visible challenge. With an ad blocker that blocks Cloudflare: “The security check didn’t complete…” |
| S5 | Admin → Security → enter a wrong recovery code 6 times (needs an aal1 session, i.e. at the two-factor prompt use “Lost your phone?”) | Tries 1–5: “incorrect”; try 6: “Too many attempts…”. Global Admin → Security → “Limits reached” lists “Recovery-code guesses” for that person |
| S6 | Admin → Reports → download CSV 31 times within an hour | The 31st is refused with “Too many attempts…” |
| S7 | Settings → upload a `.txt` file renamed to `logo.png` | Refused: “That file isn’t a real PNG, JPG or WebP image.” A real PNG works |
| S8 | Open browser DevTools → Console on `/`, `/login`, `/admin`, `/app` (with the map) | No red “Content Security Policy” / “Refused to load” messages; maps show tiles |
| S9 | Visit `/.env`, `/.git/config`, `/package.json` | 404 for all |
| S10 | `https://<host>/api/health` | `{"ok":true,"db":true,"version":"…"}` |
| S11 | Payment: Billing → pay with Paystack test card | Goes to Paystack and back with “Payment received” (checks the CSP allows the Paystack redirect) |
| S12 | Global Admin → People → “Send password reset” (with CAPTCHA on) | Email arrives (confirms server-side emails are not blocked by CAPTCHA) |

---

## 12. Results table

| ID | Result (PASS/FAIL/BLOCKED) | Notes / bug # |
|---|---|---|
| P1 | | |
| … | | |

---

## 13. Bug report template

```
Bug #: 
Test ID: 
Account used: 
URL: 
Steps to reproduce:
1.
2.
Expected:
Actual:
Error reference code (if shown):
Screenshot: 
Browser / device / screen width:
```
